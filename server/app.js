import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { extractDocument } from "./extract.js";
import {
  fetchLedger,
  issueProjectToken,
  loginToNewApi,
  pickTextModel,
  proxyUpstream
} from "./newapi.js";
import { finalizeQa, prepareQa } from "./qa.js";
import { openStore } from "./store.js";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const SECRET_KEY = /^(key|token|access_token|refresh_token|password|authorization|secret|api_key|apikey|session|cookie)$/i;

function scrub(value, depth) {
  if (depth > 8) return null;
  if (typeof value === "string") {
    return value.replace(/sk-[A-Za-z0-9_-]{2,}/g, "sk-****").replace(/Bearer\s+\S+/gi, "Bearer ****");
  }
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = scrub(item, depth + 1);
    }
    return out;
  }
  return value;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(scrub(payload, 0));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(body);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(/; */).forEach((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    out[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
  });
  return out;
}

function sessionCookie(id, maxAgeSeconds) {
  return `rg_session=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("too big");
        error.status = 413;
        error.publicMessage = "文件太大，融光没有接收。";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!match) {
    const error = new Error("boundary");
    error.status = 400;
    error.publicMessage = "上传格式无法识别。";
    throw error;
  }
  const boundary = (match[1] || match[2] || "").trim();
  const sep = Buffer.from("--" + boundary);
  const parts = [];
  let start = buffer.indexOf(sep);
  if (start < 0) return parts;
  start += sep.length;
  while (start < buffer.length) {
    if (buffer.subarray(start, start + 2).toString() === "--") break;
    if (buffer.subarray(start, start + 2).toString() === "\r\n") start += 2;
    const next = buffer.indexOf(sep, start);
    if (next < 0) break;
    let chunk = buffer.subarray(start, next);
    if (chunk.subarray(-2).toString() === "\r\n") chunk = chunk.subarray(0, -2);
    const headerEnd = chunk.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = chunk.subarray(0, headerEnd).toString("utf8");
      const body = chunk.subarray(headerEnd + 4);
      const name = /name="([^"]*)"/.exec(header);
      const star = /filename\*=UTF-8''([^;\r\n]+)/i.exec(header);
      const quoted = /filename="([^"]*)"/.exec(header);
      let filename = "";
      if (star) {
        try { filename = decodeURIComponent(star[1]); } catch { filename = star[1]; }
      } else if (quoted) filename = quoted[1];
      parts.push({ name: name ? name[1] : "", filename, body });
    }
    start = next + sep.length;
  }
  return parts;
}

function safeName(name) {
  const base = String(name || "").split(/[/\\]/).pop().replace(/[\u0000-\u001f]/g, "").trim();
  const cleaned = base.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  return cleaned || "资料.txt";
}

function matchPath(pathname, pattern) {
  const names = [];
  const expression = new RegExp("^" + pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
    names.push(name);
    return "([^/]+)";
  }) + "$");
  const found = expression.exec(pathname);
  if (!found) return null;
  const params = {};
  names.forEach((name, index) => {
    params[name] = decodeURIComponent(found[index + 1]);
  });
  return params;
}

function stripSecretFields(buffer, contentType) {
  if (!/json/i.test(String(contentType || ""))) return buffer;
  try {
    const json = JSON.parse(buffer.toString("utf8"));
    if (json && typeof json === "object" && !Array.isArray(json)) {
      delete json.key;
      delete json.api_key;
      delete json.apiKey;
      delete json.authorization;
      delete json.token;
      delete json.password;
    }
    return Buffer.from(JSON.stringify(json));
  } catch {
    return buffer;
  }
}

function assistantText(data) {
  const choice = data && data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("");
  }
  return "";
}

async function pipeUpstream(upstream, res) {
  const headers = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  const type = upstream.headers.get("content-type");
  if (type) headers["content-type"] = type;
  res.writeHead(upstream.status, headers);
  if (!upstream.body) {
    res.end();
    return;
  }
  const { Readable } = await import("node:stream");
  await new Promise((resolve, reject) => {
    Readable.fromWeb(upstream.body).on("error", reject).pipe(res).on("finish", resolve).on("error", reject);
  });
}

function serveStatic(req, res, staticDir, pathname) {
  const root = path.resolve(staticDir);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = path.resolve(root, "." + requested);
  if (!file.startsWith(root + path.sep) && file !== root) {
    sendJson(res, 404, { message: "没有这个页面。" });
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      sendJson(res, 404, { message: "没有这个页面。" });
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": path.extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
      "x-content-type-options": "nosniff"
    });
    res.end(data);
  });
}

async function handle(req, res, ctx) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = url.pathname;
  if (req.method === "GET" && pathname === "/api/rg/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method === "POST" && pathname === "/api/rg/login") {
    const body = JSON.parse((await readBody(req, 32000)).toString("utf8") || "{}");
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) {
      sendJson(res, 401, { message: "请填写用户名和密码。" });
      return;
    }
    const result = await loginToNewApi(ctx.newApiBase, username, password);
    if (result.network) {
      sendJson(res, 503, { message: "网络异常，暂时连不上网关。请稍后再试。" });
      return;
    }
    if (!result.ok) {
      sendJson(res, result.status || 401, { message: result.message || "用户名或密码不正确。" });
      return;
    }
    const id = ctx.store.createSession(result.user, {
      accessToken: result.accessToken,
      cookies: result.cookies,
      userId: result.user.id
    });
    res.setHeader("set-cookie", sessionCookie(id, 7 * 24 * 60 * 60));
    sendJson(res, 200, { username: result.user.username, displayName: result.user.displayName });
    return;
  }
  if (req.method === "POST" && pathname === "/api/rg/logout") {
    const session = ctx.store.readSession(parseCookies(req).rg_session);
    if (session) ctx.store.deleteSession(session.id);
    res.setHeader("set-cookie", sessionCookie("", 0));
    sendJson(res, 200, { ok: true });
    return;
  }

  const session = ctx.store.readSession(parseCookies(req).rg_session);
  const needsSession = pathname.startsWith("/api/rg/");
  if (needsSession && !session) {
    sendJson(res, 401, { code: "session", message: "登录已失效，请重新登录。" });
    return;
  }
  if (req.method === "GET" && pathname === "/api/rg/me") {
    sendJson(res, 200, { username: session.username, displayName: session.displayName });
    return;
  }
  if (pathname === "/api/rg/projects" && req.method === "GET") {
    sendJson(res, 200, { projects: ctx.store.listProjects(session.username) });
    return;
  }
  if (pathname === "/api/rg/projects" && req.method === "POST") {
    const body = JSON.parse((await readBody(req, 32000)).toString("utf8") || "{}");
    const name = String(body.name || "").replace(/[\u0000-\u001f]/g, "").trim();
    if (!name || name.length > 40) {
      sendJson(res, 400, { message: "请填写 1 到 40 个字的项目名称。" });
      return;
    }
    if (ctx.store.countProjects(session.username) >= 30) {
      sendJson(res, 400, { message: "项目太多了。请先沿用已有项目。" });
      return;
    }
    let issued;
    try {
      issued = await issueProjectToken(ctx.newApiBase, session.auth, name);
    } catch (error) {
      sendJson(res, 502, { message: error.publicMessage || "没能为这个项目签发钥匙。" });
      return;
    }
    const project = ctx.store.createProject(session.username, name, issued);
    sendJson(res, 200, { project });
    return;
  }

  const owned = (projectId) => {
    const project = ctx.store.getProject(session.username, projectId);
    if (!project) {
      sendJson(res, 404, { message: "没有这个项目。" });
      return null;
    }
    return project;
  };
  const keyFor = (projectId) => {
    try {
      return ctx.store.projectKey(session.username, projectId);
    } catch {
      sendJson(res, 500, { message: "项目钥匙无法读取。请重新创建项目。" });
      return "";
    }
  };

  let params = matchPath(pathname, "/api/rg/projects/:id/docs");
  if (params && req.method === "GET") {
    if (!owned(params.id)) return;
    sendJson(res, 200, { documents: ctx.store.listDocs(params.id) });
    return;
  }
  if (params && req.method === "POST") {
    const project = owned(params.id);
    if (!project) return;
    if (ctx.store.countDocs(project.id) >= 12) {
      sendJson(res, 400, { message: "这个项目的资料已到上限（12 份）。" });
      return;
    }
    const raw = await readBody(req, 4 * 1024 * 1024 + 65536);
    const file = parseMultipart(raw, req.headers["content-type"]).find((part) => part.filename);
    if (!file) {
      sendJson(res, 400, { message: "请选择要上传的资料。" });
      return;
    }
    if (file.body.length > 4 * 1024 * 1024) {
      sendJson(res, 413, { message: "文件超过 4MB。" });
      return;
    }
    let extracted;
    try {
      extracted = await extractDocument(file.filename, file.body);
    } catch (error) {
      const missing = error && error.code === "ENOENT";
      sendJson(res, 400, { message: missing ? "服务器还不能读取这种文件。" : (error.message || "没有读出文字。") });
      return;
    }
    if (!extracted.text) {
      sendJson(res, 400, { message: "没有从这份文件里读出文字。" });
      return;
    }
    const document = ctx.store.addDocument(project.id, {
      filename: safeName(file.filename),
      bytes: file.body.length,
      text: extracted.text,
      clipped: extracted.clipped,
      ext: extracted.ext,
      bytesBody: file.body
    });
    sendJson(res, 200, { document });
    return;
  }

  params = matchPath(pathname, "/api/rg/projects/:id/docs/:docId");
  if (params && req.method === "DELETE") {
    if (!owned(params.id)) return;
    const removed = ctx.store.deleteDocument(params.id, params.docId);
    sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { message: "没有这份资料。" });
    return;
  }

  params = matchPath(pathname, "/api/rg/projects/:id/qa");
  if (params && req.method === "POST") {
    const project = owned(params.id);
    if (!project) return;
    const key = keyFor(project.id);
    if (!key) return;
    const body = JSON.parse((await readBody(req, 64000)).toString("utf8") || "{}");
    const question = String(body.question || "").trim();
    if (!question) {
      sendJson(res, 400, { message: "请输入要问的问题。" });
      return;
    }
    const prep = prepareQa(question, ctx.store.listDocTexts(project.id));
    if (prep.unknown) {
      sendJson(res, 200, { text: prep.text, citations: [], unknown: true });
      return;
    }
    let modelText = "";
    try {
      let model = String(body.model || "").trim();
      if (!model) {
        const models = await proxyUpstream(ctx.newApiBase, key, "GET", "/v1/models", {});
        model = pickTextModel(await models.json());
      }
      if (model) {
        const chat = await proxyUpstream(ctx.newApiBase, key, "POST", "/v1/chat/completions", {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0,
            stream: false,
            messages: prep.messages
          })
        });
        if (chat.ok) modelText = assistantText(await chat.json());
      }
    } catch {
      modelText = "";
    }
    sendJson(res, 200, finalizeQa(prep, modelText));
    return;
  }

  params = matchPath(pathname, "/api/rg/projects/:id/ledger");
  if (params && req.method === "GET") {
    const project = owned(params.id);
    if (!project) return;
    const key = keyFor(project.id);
    if (!key) return;
    sendJson(res, 200, await fetchLedger(ctx.newApiBase, key, project.name));
    return;
  }

  const proxied = [
    ["/api/rg/projects/:id/v1/models", "GET", "/v1/models"],
    ["/api/rg/projects/:id/v1/chat/completions", "POST", "/v1/chat/completions"],
    ["/api/rg/projects/:id/v1/images/generations", "POST", "/v1/images/generations"],
    ["/api/rg/projects/:id/v1/audio/transcriptions", "POST", "/v1/audio/transcriptions"]
  ];
  for (const [pattern, method, upstreamPath] of proxied) {
    params = matchPath(pathname, pattern);
    if (!params || req.method !== method) continue;
    const project = owned(params.id);
    if (!project) return;
    const key = keyFor(project.id);
    if (!key) return;
    const raw = method === "GET" ? undefined : stripSecretFields(await readBody(req, 12 * 1024 * 1024), req.headers["content-type"]);
    const headers = {};
    if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
    const upstream = await proxyUpstream(ctx.newApiBase, key, method, upstreamPath, { headers, body: raw });
    await pipeUpstream(upstream, res);
    return;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(res, 404, { message: "没有这个接口。" });
    return;
  }
  if (ctx.staticDir && (req.method === "GET" || req.method === "HEAD")) {
    serveStatic(req, res, ctx.staticDir, pathname);
    return;
  }
  sendJson(res, 404, { message: "没有这个页面。" });
}

export function createApp(options) {
  if (!options.sessionSecret) {
    throw new Error("缺少 SESSION_SECRET");
  }
  const ctx = {
    store: openStore(options.dataDir, options.sessionSecret),
    newApiBase: String(options.newApiBase || "").replace(/\/+$/, ""),
    staticDir: options.staticDir || ""
  };
  return http.createServer((req, res) => {
    handle(req, res, ctx).catch((error) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status = error && error.status ? error.status : 500;
      let message = error && error.publicMessage ? error.publicMessage : "融光暂时没有完成这次请求。";
      if (error instanceof SyntaxError) {
        sendJson(res, 400, { message: "请求无法识别。" });
        return;
      }
      sendJson(res, status, { message });
    });
  });
}
