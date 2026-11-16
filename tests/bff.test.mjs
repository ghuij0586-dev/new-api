import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createApp } from "../server/app.js";
import { encryptPassword } from "../server/crypto.js";
import { extractDocument } from "../server/extract.js";
import { finalizeQa, prepareQa, UNKNOWN_TEXT } from "../server/qa.js";
import { startMockNewApi } from "./mock-new-api.mjs";
import crypto from "node:crypto";

const SECRET = "test-secret-not-for-production";

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return "http://127.0.0.1:" + server.address().port;
}

function startBff(mock, dir) {
  return createApp({
    dataDir: dir,
    sessionSecret: SECRET,
    newApiBase: mock.base,
    staticDir: path.resolve("public")
  });
}

async function login(base, username, password) {
  return fetch(base + "/api/rg/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

test("login errors stay inline and never return a gateway key", async () => {
  const mock = await startMockNewApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-bff-"));
  const app = startBff(mock, dir);
  const base = await listen(app);
  try {
    const wrong = await login(base, "xiaowang", "nope");
    const wrongBody = await wrong.json();
    assert.equal(wrong.status, 401);
    assert.match(wrongBody.message, /用户名或密码不正确/);
    assert.equal(wrong.headers.get("set-cookie"), null);

    const disabled = await login(base, "disabled", "secret-pass");
    const disabledBody = await disabled.json();
    assert.equal(disabled.status, 403);
    assert.match(disabledBody.message, /账号未启用/);

    const down = createApp({
      dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "rg-down-")),
      sessionSecret: SECRET,
      newApiBase: "http://127.0.0.1:9"
    });
    const downBase = await listen(down);
    const offline = await login(downBase, "xiaowang", "secret-pass");
    const offlineBody = await offline.json();
    assert.equal(offline.status, 503);
    assert.match(offlineBody.message, /网络异常/);
    down.close();

    const ok = await login(base, "xiaowang", "secret-pass");
    const okBody = await ok.json();
    const cookie = ok.headers.get("set-cookie") || "";
    assert.equal(ok.status, 200);
    assert.equal(okBody.username, "xiaowang");
    assert.equal(JSON.stringify(okBody).includes("dashboard-"), false);
    assert.equal(JSON.stringify(okBody).includes("secret-pass"), false);
    assert.equal(JSON.stringify(okBody).includes("sk-"), false);
    assert.match(cookie, /rg_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.equal(cookie.includes("sk-"), false);
  } finally {
    app.close();
    mock.server.close();
  }
});

test("one project gets one key, and the browser payload never contains it", async () => {
  const mock = await startMockNewApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-key-"));
  const app = startBff(mock, dir);
  const base = await listen(app);
  try {
    const logged = await login(base, "xiaowang", "secret-pass");
    const cookie = (logged.headers.get("set-cookie") || "").split(";")[0];
    async function create(name, extra) {
      const res = await fetch(base + "/api/rg/projects", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(Object.assign({ name }, extra || {}))
      });
      const text = await res.text();
      assert.equal(res.status, 200, text);
      assert.equal(text.includes("sk-"), false);
      assert.equal(text.includes("secret-pass"), false);
      assert.equal(text.includes("dashboard-"), false);
      return JSON.parse(text).project;
    }
    const first = await create("西湖茶事", { key: "sk-stolen-from-browser" });
    const second = await create("东湖茶事");
    assert.notEqual(first.id, second.id);
    assert.equal(mock.tokens.length, 2);
    assert.notEqual(mock.tokens[0].key, mock.tokens[1].key);
    assert.equal(mock.tokens.some((token) => token.key === "sk-stolen-from-browser"), false);

    const rawDb = fs.readFileSync(path.join(dir, "rongguang.sqlite"));
    assert.equal(rawDb.includes(Buffer.from("secret-pass")), false);
    assert.equal(rawDb.includes(Buffer.from(mock.tokens[0].key)), false);
    assert.equal(rawDb.includes(Buffer.from("dashboard-2")), false);

    const listed = await fetch(base + "/api/rg/projects", { headers: { cookie } });
    const listedText = await listed.text();
    assert.equal(listedText.includes("sk-"), false);
    assert.match(listedText, /西湖茶事/);
    assert.match(listedText, /东湖茶事/);

    const chat = await fetch(base + "/api/rg/projects/" + first.id + "/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, authorization: "Bearer sk-from-browser" },
      body: JSON.stringify({ model: "qwen-plus", messages: [{ role: "user", content: "你好" }] })
    });
    const chatText = await chat.text();
    assert.equal(chat.status, 200);
    assert.match(chatText, /你好，同事/);
    assert.equal(chatText.includes(mock.tokens[0].key), false);
    const upstream = mock.requests.filter((item) => item.path === "/v1/chat/completions");
    assert.equal(upstream.at(-1).authorization, "Bearer " + mock.tokens[0].key);
    assert.equal(upstream.at(-1).authorization.includes(mock.tokens[1].key), false);

    const other = await fetch(base + "/api/rg/projects/" + second.id + "/v1/models", { headers: { cookie } });
    assert.equal(other.status, 200);
    const modelCalls = mock.requests.filter((item) => item.path === "/v1/models");
    assert.equal(modelCalls.at(-1).authorization, "Bearer " + mock.tokens[1].key);
  } finally {
    app.close();
    mock.server.close();
  }
});

test("project Q&A cites a source and refuses questions outside the documents", async () => {
  const prepared = prepareQa("报销流程是什么？", [{ filename: "制度.txt", text: "融光试运行的办公地址在杭州西湖。会议室在二楼。" }]);
  assert.equal(prepared.unknown, true);
  assert.equal(prepared.text, UNKNOWN_TEXT);
  assert.equal(prepared.messages.length, 0);

  const known = prepareQa("办公地址在哪里？", [{ filename: "制度.txt", text: "融光试运行的办公地址在杭州西湖。会议室在二楼。" }]);
  assert.equal(known.unknown, false);
  assert.match(known.messages[0].content, /禁止使用摘录以外的知识/);
  assert.match(known.messages[0].content, /根据当前项目资料，我不知道/);
  assert.equal(known.citations[0].filename, "制度.txt");
  assert.match(known.citations[0].excerpt, /杭州西湖/);

  const invented = finalizeQa(known, "巴黎是法国的首都。");
  assert.equal(invented.unknown, false);
  assert.equal(invented.text.includes("巴黎"), false);
  assert.match(invented.text, /制度\.txt/);
  assert.match(invented.text, /杭州西湖/);

  const mock = await startMockNewApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-qa-"));
  const app = startBff(mock, dir);
  const base = await listen(app);
  try {
    const logged = await login(base, "xiaowang", "secret-pass");
    const cookie = (logged.headers.get("set-cookie") || "").split(";")[0];
    const created = await fetch(base + "/api/rg/projects", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "西湖茶事" })
    });
    const project = (await created.json()).project;
    const file = new FormData();
    file.append("file", new Blob(["融光试运行的办公地址在杭州西湖。会议室在二楼。"], { type: "text/plain" }), "制度.txt");
    const uploaded = await fetch(base + "/api/rg/projects/" + project.id + "/docs", { method: "POST", headers: { cookie }, body: file });
    assert.equal(uploaded.status, 200, await uploaded.text());
    const before = mock.requests.filter((item) => item.path === "/v1/chat/completions").length;
    const unknown = await fetch(base + "/api/rg/projects/" + project.id + "/qa", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ question: "报销流程是什么？" })
    });
    const unknownBody = await unknown.json();
    assert.match(unknownBody.text, /根据当前项目资料，我不知道/);
    assert.deepEqual(unknownBody.citations, []);
    assert.equal(mock.requests.filter((item) => item.path === "/v1/chat/completions").length, before);

    const cited = await fetch(base + "/api/rg/projects/" + project.id + "/qa", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ question: "办公地址在哪里？" })
    });
    const citedText = await cited.text();
    const citedBody = JSON.parse(citedText);
    assert.match(citedBody.text, /杭州西湖/);
    assert.equal(citedBody.citations[0].filename, "制度.txt");
    assert.match(citedBody.citations[0].excerpt, /杭州西湖/);
    assert.equal(citedText.includes(mock.tokens[0].key), false);
    const qaCall = mock.requests.filter((item) => item.path === "/v1/chat/completions").at(-1);
    assert.match(qaCall.body, /禁止使用摘录以外的知识/);
    assert.equal(qaCall.authorization, "Bearer " + mock.tokens[0].key);
  } finally {
    app.close();
    mock.server.close();
  }
});

test("ledger payload hides the key and keeps cache tokens for the wording layer", async () => {
  const mock = await startMockNewApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-ledger-"));
  const app = startBff(mock, dir);
  const base = await listen(app);
  try {
    const logged = await login(base, "xiaowang", "secret-pass");
    const cookie = (logged.headers.get("set-cookie") || "").split(";")[0];
    const created = await fetch(base + "/api/rg/projects", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "西湖茶事" })
    });
    const project = (await created.json()).project;
    const res = await fetch(base + "/api/rg/projects/" + project.id + "/ledger", { headers: { cookie } });
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(body.projectName, "西湖茶事");
    assert.equal(body.quota.name, "西湖茶事");
    assert.equal(body.quota.total_available, 620000);
    assert.equal(body.logs[0].cache_tokens, 40);
    assert.equal(body.logs[0].prompt_tokens, 800);
    assert.equal(text.includes("token-name-should-not-leak"), false);
    assert.equal(text.includes(mock.tokens[0].key), false);
    assert.equal(text.includes("sk-"), false);
  } finally {
    app.close();
    mock.server.close();
  }
});

test("txt, pdf and docx extraction keep readable text", async () => {
  const txt = await extractDocument("笔记.txt", Buffer.from("办公地址在杭州西湖", "utf8"));
  assert.match(txt.text, /杭州西湖/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-docx-"));
  fs.mkdirSync(path.join(dir, "word"));
  fs.writeFileSync(path.join(dir, "word/document.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>会议室在二楼</w:t></w:r></w:p></w:body></w:document>`);
  const docxPath = path.join(dir, "note.docx");
  execFileSync("zip", ["-q", docxPath, "word/document.xml"], { cwd: dir });
  const docx = await extractDocument("纪要.docx", fs.readFileSync(docxPath));
  assert.match(docx.text, /会议室在二楼/);

  const pdf = await extractDocument("地址.pdf", makePdf("Hangzhou Xihu office"));
  assert.match(pdf.text, /Hangzhou Xihu office/);
});

test("password encryption uses RSA-OAEP when New API asks for it", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const encoded = encryptPassword("secret-pass", pem);
  const decoded = crypto.privateDecrypt({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256"
  }, Buffer.from(encoded, "base64"));
  assert.equal(decoded.toString("utf8"), "secret-pass");
});

test("the workstation page does not ask for a gateway token", () => {
  const html = fs.readFileSync(path.resolve("public/index.html"), "utf8");
  const app = fs.readFileSync(path.resolve("public/js/app.js"), "utf8");
  assert.equal(html.includes("tokenInput"), false);
  assert.equal(html.includes("更换令牌"), false);
  assert.equal(html.includes("API 根地址"), false);
  assert.equal(html.includes("sk-"), false);
  assert.match(html, /登录融光/);
  assert.match(html, /用账号进入工作台/);
  assert.match(html, /进入融光/);
  assert.match(html, /对话记录默认只保存在这台浏览器，可导出到本地。但只要向模型提问，内容仍会经过网关，离开这台电脑。/);
  assert.equal(/set\(\s*["']Authorization/.test(app), false);
  assert.equal(app.includes("Bearer "), false);
  assert.equal(app.includes("sk-"), false);
});

function makePdf(text) {
  const content = `BT /F1 18 Tf 36 100 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n",
    `4 0 obj<</Length ${Buffer.byteLength(content)}>>stream\n${content}\nendstream\nendobj\n`,
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xrefAt = Buffer.byteLength(body);
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  body += xref + `trailer<</Size 6/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
