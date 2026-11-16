import { encryptPassword } from "./crypto.js";

const CACHE_FIELDS = [
  "cache_tokens",
  "prompt_cache_hit_tokens",
  "cached_tokens",
  "prompt_cache_tokens",
  "cache_read_tokens"
];

export function failureMessage(message) {
  const msg = String(message || "");
  const low = msg.toLowerCase();
  if (/验证码|turnstile|captcha/.test(low)) {
    return { status: 401, message: "网关要求验证码，这里暂时完成不了。请让管理员关闭登录验证码后再试。" };
  }
  if (/两步|2fa|totp|one-time|otp/.test(low)) {
    return { status: 401, message: "这个账号开启了额外验证，融光暂时不能登录。请让管理员关闭两步验证后再试。" };
  }
  if (/password login has been disabled|关闭了密码登录|管理员关闭了密码登录/.test(low)) {
    return { status: 403, message: "管理员关闭了密码登录。请让管理员在 New API 重新打开。" };
  }
  const banned = /封禁|禁用|未启用|banned|disabled|not enabled/.test(low);
  const wrong = /密码|password|incorrect|invalid parameter|用户名/.test(low);
  if (banned && !wrong) {
    return { status: 403, message: "账号未启用。请让管理员在 New API 的用户管理里启用这个账号。" };
  }
  if (banned && wrong) {
    return { status: 401, message: "用户名或密码不正确。如果账号已被停用，请让管理员在用户管理里启用。" };
  }
  return { status: 401, message: "用户名或密码不正确。" };
}

export function classifyLogin(json, cookieHeader) {
  if (!json || typeof json !== "object") {
    return { ok: false, status: 502, message: "网关返回了无法识别的内容。" };
  }
  if (json.success === false || json.success === 0) {
    return { ok: false, ...failureMessage(json.message || json.msg || "") };
  }
  const data = json.data && typeof json.data === "object" ? json.data : {};
  if (data.require_2fa || data.requires_2fa || data.challenge || data.pending_challenge) {
    return { ok: false, status: 401, message: "这个账号开启了额外验证，融光暂时不能登录。请让管理员关闭两步验证后再试。" };
  }
  const user = data.user && typeof data.user === "object" ? data.user : data;
  if (user.status != null && user.status !== "" && Number(user.status) !== 1) {
    return { ok: false, status: 403, message: "账号未启用。请让管理员在 New API 的用户管理里启用这个账号。" };
  }
  const accessToken = String(data.access_token || data.accessToken || "");
  const username = String(user.username || "").trim();
  if (!username || (!accessToken && !cookieHeader)) {
    return { ok: false, status: 502, message: "网关没有建立会话。请让管理员确认账号密码登录已开启。" };
  }
  return {
    ok: true,
    user: {
      id: user.id,
      username,
      displayName: String(user.display_name || user.displayName || username)
    },
    accessToken,
    cookies: cookieHeader || ""
  };
}

function cookieHeaderFrom(response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return list
    .map((item) => String(item || "").split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function rootOf(base) {
  return String(base || "").replace(/\/+$/, "");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text.slice(0, 180) };
  }
}

export async function loginToNewApi(base, username, password) {
  const root = rootOf(base);
  let body = { username, password };
  try {
    const keyRes = await fetch(root + "/api/user/login/encryption-key", {
      signal: AbortSignal.timeout(8000)
    });
    if (keyRes.ok) {
      const keyJson = await readJson(keyRes);
      const data = keyJson.data && typeof keyJson.data === "object" ? keyJson.data : keyJson;
      if (data && data.enabled && data.public_key && data.kid) {
        body = {
          username,
          password_encrypted: encryptPassword(password, data.public_key),
          encryption_key_id: String(data.kid)
        };
      }
    }
  } catch {
    // 旧版本没有这个接口时，继续用明文密码交给 New API。
  }
  let response;
  try {
    response = await fetch(root + "/api/user/login", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    return { network: true };
  }
  const json = await readJson(response);
  if (response.status >= 500) {
    return { ok: false, status: 502, message: "网关暂时没有回应。请稍后再试。" };
  }
  return classifyLogin(json, cookieHeaderFrom(response));
}

function authHeaders(cred, extra) {
  const headers = Object.assign({}, extra || {});
  if (cred && cred.accessToken) {
    headers.authorization = "Bearer " + cred.accessToken;
    if (cred.userId != null && cred.userId !== "") headers["new-api-user"] = String(cred.userId);
  }
  if (cred && cred.cookies) headers.cookie = cred.cookies;
  return headers;
}

export async function apiJson(base, cred, method, pathname, body) {
  const response = await fetch(rootOf(base) + pathname, {
    method,
    headers: authHeaders(cred, body == null ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" }),
    body: body == null ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20000)
  });
  const json = await readJson(response);
  return { status: response.status, json };
}

function collectTokenItems(json) {
  const piles = [];
  const visit = (value, depth) => {
    if (!value || depth > 4) return;
    if (Array.isArray(value)) {
      if (value.some((item) => item && typeof item === "object" && ("key" in item || "name" in item))) piles.push(value);
      return;
    }
    if (typeof value === "object") {
      for (const key of Object.keys(value)) visit(value[key], depth + 1);
    }
  };
  visit(json, 0);
  return piles.flat();
}

function fullKey(value) {
  const text = String(value || "").trim();
  if (!text || text.includes("*") || text.length < 12) return "";
  if (/^sk-/i.test(text)) return text.startsWith("sk-") ? text : "sk-" + text.slice(3);
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return "sk-" + text;
  return "";
}

function extractKey(json) {
  if (!json || typeof json !== "object") return "";
  const direct = [json.key, json.data && json.data.key, json.data && json.data.token && json.data.token.key];
  for (const item of direct) {
    const key = fullKey(item);
    if (key) return key;
  }
  if (typeof json.data === "string") {
    const key = fullKey(json.data);
    if (key) return key;
  }
  return "";
}

function extractId(json) {
  if (!json || typeof json !== "object") return "";
  const id = json.id || (json.data && (json.data.id || json.data.token_id));
  return id == null ? "" : String(id);
}

export async function issueProjectToken(base, cred, projectName) {
  const tokenName = ("rg" + Math.random().toString(36).slice(2, 10) + projectName.replace(/\s+/g, "")).slice(0, 30);
  const created = await apiJson(base, cred, "POST", "/api/token/", {
    name: tokenName,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    model_limits_enabled: false,
    model_limits: "",
    group: "",
    allow_ips: ""
  });
  if (created.json && created.json.success === false) {
    const error = new Error("issue");
    error.publicMessage = created.json.message || "没能为这个项目签发钥匙。请确认账号可以在 New API 创建令牌。";
    throw error;
  }
  let key = extractKey(created.json);
  let id = extractId(created.json);
  if (!key) {
    let items = [];
    for (const pathname of ["/api/token/?p=1&size=100", "/api/token/?p=0", "/api/token/"]) {
      const list = await apiJson(base, cred, "GET", pathname, null);
      items = collectTokenItems(list.json).filter((item) => item && item.name === tokenName);
      if (items.length) break;
    }
    items.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    const picked = items[0];
    if (picked) {
      id = String(picked.id || id || "");
      key = fullKey(picked.key);
      if (!key && id) {
        const revealed = await apiJson(base, cred, "POST", `/api/token/${encodeURIComponent(id)}/key`, {});
        key = extractKey(revealed.json);
      }
    }
  }
  if (!key) {
    const error = new Error("issue");
    error.publicMessage = "没能为这个项目签发钥匙。请确认这个账号可以在 New API 创建令牌。";
    throw error;
  }
  return { id, key, name: tokenName };
}

export function pickCache(item) {
  const consider = (obj, depth) => {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    for (const name of CACHE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, name) && obj[name] != null && obj[name] !== "") {
        const value = Number(obj[name]);
        if (Number.isFinite(value)) return { field: name, value };
      }
    }
    if (typeof obj.other === "string" && obj.other) {
      try {
        return consider(JSON.parse(obj.other), depth + 1);
      } catch {
        return null;
      }
    }
    if (obj.other && typeof obj.other === "object") return consider(obj.other, depth + 1);
    return null;
  };
  return consider(item, 0);
}

export function sanitizeUsage(json, projectName) {
  const data = json && json.data && typeof json.data === "object" ? json.data : json;
  if (!data || typeof data !== "object") return null;
  if (!("total_used" in data) && !("unlimited_quota" in data) && !("total_granted" in data)) return null;
  return {
    name: projectName,
    total_granted: Number(data.total_granted) || 0,
    total_used: Number(data.total_used) || 0,
    total_available: Number(data.total_available) || 0,
    unlimited_quota: Boolean(data.unlimited_quota),
    model_limits_enabled: Boolean(data.model_limits_enabled),
    expires_at: Number(data.expires_at) || 0
  };
}

export function sanitizeLogs(json) {
  const list = Array.isArray(json) ? json : json && Array.isArray(json.data) ? json.data : json && json.data && Array.isArray(json.data.items) ? json.data.items : null;
  if (!list) return { logs: null, truncated: false };
  const logs = list.slice(0, 1000).map((item) => {
    const row = {
      model_name: String(item.model_name || item.modelName || "").replace(/sk-[A-Za-z0-9_-]{2,}/g, "").slice(0, 80),
      prompt_tokens: Number(item.prompt_tokens || item.promptTokens) || 0,
      completion_tokens: Number(item.completion_tokens || item.completionTokens) || 0,
      quota: Number(item.quota) || 0,
      created_at: Number(item.created_at != null ? item.created_at : item.createdAt) || 0,
      type: item.type == null ? 2 : Number(item.type)
    };
    const cache = pickCache(item);
    if (cache) row[cache.field] = cache.value;
    return row;
  });
  const total = Number(json && (json.total || (json.data && json.data.total))) || 0;
  return { logs, truncated: list.length >= 1000 || (total > 0 && total > logs.length) };
}

export async function fetchLedger(base, projectKey, projectName) {
  const headers = { authorization: "Bearer " + projectKey, accept: "application/json" };
  const root = rootOf(base);
  const result = { quota: null, quotaError: null, logs: null, logError: null, truncated: false, projectName };
  try {
    let usage = await fetch(root + "/api/usage/token/", { headers, signal: AbortSignal.timeout(20000) });
    if (usage.status === 404 || usage.status === 405) {
      usage = await fetch(root + "/api/usage/token", { headers, signal: AbortSignal.timeout(20000) });
    }
    const usageJson = await readJson(usage);
    if (!usage.ok) {
      result.quotaError = { title: "没有读到这个项目的额度。", detail: String(usageJson.message || usageJson.error && usageJson.error.message || usage.status) };
    } else {
      result.quota = sanitizeUsage(usageJson, projectName);
      if (!result.quota) result.quotaError = { title: "额度的格式无法识别。", detail: "" };
    }
  } catch {
    result.quotaError = { title: "没有读到这个项目的额度。", detail: "网络异常" };
  }
  try {
    const logsRes = await fetch(root + "/api/log/token", { headers, signal: AbortSignal.timeout(20000) });
    const logsJson = await readJson(logsRes);
    if (!logsRes.ok || logsJson.success === false) {
      result.logError = { title: "调用记录没有读到。", detail: String(logsJson.message || logsRes.status) };
    } else {
      const parsed = sanitizeLogs(logsJson);
      if (!parsed.logs) result.logError = { title: "调用记录的格式无法识别。", detail: "" };
      else {
        result.logs = parsed.logs;
        result.truncated = parsed.truncated;
      }
    }
  } catch {
    result.logError = { title: "调用记录没有读到。", detail: "网络异常" };
  }
  return result;
}

export async function proxyUpstream(base, projectKey, method, pathname, { headers, body, signal }) {
  const incoming = new Headers(headers || {});
  incoming.delete("authorization");
  incoming.delete("cookie");
  incoming.delete("host");
  incoming.set("authorization", "Bearer " + projectKey);
  return fetch(rootOf(base) + pathname, {
    method,
    headers: incoming,
    body,
    redirect: "manual",
    signal
  });
}

const TEXT_MODELS = /embedding|embed-|rerank|whisper|dall-e|dalle|image|wanx|flux|cogview/i;

export function pickTextModel(payload) {
  const list = payload && Array.isArray(payload.data) ? payload.data : [];
  const ids = list.map((item) => String(item && item.id || "")).filter(Boolean);
  const text = ids.filter((id) => !TEXT_MODELS.test(id));
  const pool = text.length ? text : ids;
  return pool.sort()[0] || "";
}
