import http from "node:http";

export function startMockNewApi() {
  const users = {
    xiaowang: { id: 2, username: "xiaowang", password: "secret-pass", status: 1, display_name: "小王" },
    disabled: { id: 3, username: "disabled", password: "secret-pass", status: 2, display_name: "停用" }
  };
  const tokens = [];
  const requests = [];
  let seq = 1;

  function send(res, status, body, extra) {
    const headers = Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra || {});
    res.writeHead(status, headers);
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }

  function userFrom(req) {
    const auth = req.headers.authorization || "";
    const match = /^Bearer\s+dashboard-(\d+)$/.exec(auth);
    if (!match) return null;
    return Object.values(users).find((user) => String(user.id) === match[1]) || null;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const bodyText = req.method === "GET" || req.method === "HEAD" ? "" : await readBody(req);
    requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization || "", body: bodyText });
    if (url.pathname === "/api/user/login/encryption-key") {
      send(res, 200, { success: true, data: { enabled: false } });
      return;
    }
    if (url.pathname === "/api/user/login" && req.method === "POST") {
      const body = JSON.parse(bodyText || "{}");
      const user = users[body.username];
      if (!user || user.password !== body.password) {
        send(res, 200, { success: false, message: "用户名或密码错误" });
        return;
      }
      if (user.status !== 1) {
        send(res, 200, { success: false, message: "用户已被封禁" });
        return;
      }
      send(res, 200, {
        success: true,
        message: "",
        data: {
          access_token: "dashboard-" + user.id,
          token_type: "Bearer",
          user: { id: user.id, username: user.username, display_name: user.display_name, status: user.status }
        }
      }, { "set-cookie": "session=upstream-" + user.id + "; HttpOnly; Path=/" });
      return;
    }
    const user = userFrom(req);
    if (url.pathname === "/api/token/" && req.method === "POST") {
      if (!user) { send(res, 401, { success: false, message: "无权访问" }); return; }
      const body = JSON.parse(bodyText || "{}");
      const key = "sk-project-" + seq;
      const token = { id: seq, userId: user.id, name: body.name || "未命名", key };
      seq += 1;
      tokens.push(token);
      send(res, 200, { success: true, message: "" });
      return;
    }
    if (url.pathname === "/api/token/" && req.method === "GET") {
      if (!user) { send(res, 401, { success: false, message: "无权访问" }); return; }
      send(res, 200, {
        success: true,
        data: {
          items: tokens.filter((token) => token.userId === user.id).map((token) => ({
            id: token.id,
            name: token.name,
            key: token.key.slice(0, 7) + "****" + token.key.slice(-2)
          }))
        }
      });
      return;
    }
    const reveal = /^\/api\/token\/(\d+)\/key$/.exec(url.pathname);
    if (reveal && req.method === "POST") {
      if (!user) { send(res, 401, { success: false, message: "无权访问" }); return; }
      const token = tokens.find((item) => String(item.id) === reveal[1] && item.userId === user.id);
      if (!token) { send(res, 404, { success: false, message: "没有这个令牌" }); return; }
      send(res, 200, { success: true, data: { key: token.key } });
      return;
    }
    if (url.pathname === "/v1/models") {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer sk-")) { send(res, 401, { error: { message: "Invalid token" } }); return; }
      send(res, 200, { object: "list", data: [
        { id: "qwen-plus", object: "model", owned_by: "alibaba" },
        { id: "qwen-vl-plus", object: "model", owned_by: "alibaba" }
      ] });
      return;
    }
    if (url.pathname === "/v1/chat/completions") {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer sk-")) { send(res, 401, { error: { message: "Invalid token" } }); return; }
      if (bodyText.includes("摘录")) {
        const file = (bodyText.match(/文件：([^"\\\n]+)/) || [])[1] || "资料";
        const content = bodyText.includes("杭州")
          ? "办公地址在杭州西湖。\n来源：" + file
          : "巴黎是法国的首都。";
        send(res, 200, { choices: [{ message: { content } }] });
        return;
      }
      const payload = 'data: {"choices":[{"delta":{"content":"你好，同事"}}]}\n\ndata: [DONE]\n';
      if (bodyText.includes("onerror")) {
        send(res, 200, 'data: {"choices":[{"delta":{"content":"<img src=x onerror=\\"window.__xss=1\\">"}}]}\n\ndata: [DONE]\n', { "content-type": "text/event-stream; charset=utf-8" });
        return;
      }
      send(res, 200, payload, { "content-type": "text/event-stream; charset=utf-8" });
      return;
    }
    if (url.pathname === "/api/usage/token" || url.pathname === "/api/usage/token/") {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer sk-")) { send(res, 401, { success: false, message: "Invalid token" }); return; }
      send(res, 200, {
        code: true,
        message: "ok",
        data: {
          object: "token_usage",
          name: "token-name-should-not-leak",
          total_granted: 1000000,
          total_used: 380000,
          total_available: 620000,
          unlimited_quota: false,
          model_limits_enabled: false,
          expires_at: 0
        }
      });
      return;
    }
    if (url.pathname === "/api/log/token") {
      const auth = req.headers.authorization || "";
      if (!auth.startsWith("Bearer sk-")) { send(res, 401, { success: false, message: "Invalid token" }); return; }
      const now = Math.floor(Date.now() / 1000);
      send(res, 200, {
        success: true,
        data: [
          { model_name: "qwen-plus", prompt_tokens: 800, completion_tokens: 200, cache_tokens: 40, quota: 250000, created_at: now - 3600, type: 2 },
          { model_name: "old-model", prompt_tokens: 9999, completion_tokens: 1, cache_tokens: 0, quota: 9, created_at: now - 40 * 86400, type: 2 }
        ]
      });
      return;
    }
    send(res, 404, { success: false, message: "not found" });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        base: "http://127.0.0.1:" + server.address().port,
        tokens,
        requests
      });
    });
  });
}
