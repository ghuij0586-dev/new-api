const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../public/js/logic.js");

test("normalizeBase accepts empty, origin, and a pasted /v1 url", function () {
  assert.deepEqual(logic.normalizeBase("  "), { ok: true, value: "" });
  assert.deepEqual(logic.normalizeBase("http://43.110.30.115:3000"), {
    ok: true,
    value: "http://43.110.30.115:3000"
  });
  assert.deepEqual(logic.normalizeBase("http://43.110.30.115:3000/v1/"), {
    ok: true,
    value: "http://43.110.30.115:3000"
  });
  assert.equal(logic.normalizeBase("javascript:alert(1)").ok, false);
  assert.equal(logic.normalizeBase("http://user:sk-secret@host:3000").ok, false);
  assert.equal(logic.normalizeBase("43.110.30.115:3000").ok, false);
});

test("api url stays relative when the portal is same-origin", function () {
  assert.equal(logic.apiUrl("", "/v1/models"), "/v1/models");
  assert.equal(logic.apiUrl("http://43.110.30.115:3000", "/v1/models"), "http://43.110.30.115:3000/v1/models");
  assert.equal(logic.openaiBaseUrl("", "http://43.110.30.115"), "http://43.110.30.115/v1");
  assert.equal(logic.openaiBaseUrl("", "file://"), "");
});

test("redact and mask never keep a usable token", function () {
  const secret = "sk-testEXAMPLE12345678";
  assert.equal(logic.redact("bad " + secret + " end").includes(secret), false);
  assert.equal(logic.redact("Bearer " + secret), "Bearer ****");
  const masked = logic.maskToken(secret);
  assert.equal(masked.startsWith("sk-test"), true);
  assert.equal(masked.includes("EXAMPLE"), false);
});

test("classifies gateway model ids and picks an agent default", function () {
  const models = logic.parseModelsPayload({
    data: [
      { id: "qwen-plus", owned_by: "alibaba" },
      { id: "qwen-turbo", owned_by: "alibaba" },
      { id: "qwen-vl-plus", owned_by: "alibaba" },
      { id: "wanx2.1-t2i-turbo", owned_by: "alibaba" },
      { id: "whisper-1", owned_by: "openai" },
      { id: "text-embedding-3-small", owned_by: "openai" },
      { id: "gpt-4o-mini", owned_by: "openai" }
    ]
  });
  const byId = Object.fromEntries(models.map(function (m) { return [m.id, m]; }));
  assert.deepEqual(byId["qwen-plus"].kinds, ["text"]);
  assert.equal(byId["qwen-plus"].vendor, "阿里云百炼");
  assert.equal(byId["qwen-plus"].displayName, "通义千问");
  assert.ok(byId["qwen-vl-plus"].kinds.includes("vision"));
  assert.ok(byId["qwen-vl-plus"].kinds.includes("text"));
  assert.deepEqual(byId["wanx2.1-t2i-turbo"].kinds, ["image"]);
  assert.deepEqual(byId["whisper-1"].kinds, ["audio"]);
  assert.deepEqual(byId["text-embedding-3-small"].kinds, ["embedding"]);
  assert.equal(logic.pickModel(models, "vision").id, "qwen-vl-plus");
  assert.equal(logic.pickModel(models, "image").id, "wanx2.1-t2i-turbo");
  assert.equal(logic.pickModel(models, "audio").id, "whisper-1");
  assert.equal(logic.pickModel(models, "qa").id, "qwen-turbo");
  assert.equal(logic.pickModel(models, "write").id, "qwen-plus");
  assert.equal(logic.pickModel([{ id: "text-embedding-3-small", kinds: ["embedding"] }], "qa"), null);
  const caps = logic.capabilitySet(models);
  assert.deepEqual(caps.labels, ["对话", "识图", "生图", "语音"]);
});

test("explains the live New API invalid-token body in Chinese", function () {
  const raw = '{"error":{"code":"","message":"Invalid token (request id: 202611130527475034943588268d9d6zquDv1zC)","type":"new_api_error"}}';
  const explained = logic.explainHttpError({ status: 401, raw: raw });
  assert.match(explained.title, /令牌无效/);
  assert.match(explained.detail, /请求编号 202611130527475034943588268d9d6zquDv1zC/);
  assert.equal(explained.detail.includes("sk-"), false);
  assert.match(logic.explainHttpError({ status: 0, network: "network" }).title, /没有连上/);
  assert.equal(logic.explainHttpError({ status: 404, context: "audio", raw: "404" }).title, "语音转写尚未接入。");
  assert.match(logic.explainHttpError({ status: 404, context: "image", raw: "not found" }).title, /生图接口/);
  assert.match(logic.explainHttpError({ status: 429, raw: '{"error":{"message":"额度不足"}}' }).title, /额度不足|限流/);
});

test("parses chat, transcript, image, and usage payloads", function () {
  assert.equal(logic.extractAssistantText({
    choices: [{ message: { content: [{ type: "text", text: "你好" }] } }]
  }), "你好");
  assert.equal(logic.extractTranscript({ text: "今天下午对齐了门户" }), "今天下午对齐了门户");
  const image = logic.extractImageResult({
    data: [{ b64_json: "aaaa", mime_type: "image/png" }]
  });
  assert.equal(image.src, "data:image/png;base64,aaaa");
  assert.equal(logic.extractImageResult({ data: [{ url: "javascript:alert(1)" }] }), null);
  assert.equal(logic.safeImageSrc("https://example.com/a.png?x=1"), "https://example.com/a.png?x=1");
  const summary = logic.quotaSummary(logic.parseUsagePayload({
    code: true,
    data: {
      name: "同事-01",
      total_granted: 1000000,
      total_used: 380000,
      total_available: 620000,
      unlimited_quota: false,
      model_limits_enabled: false,
      expires_at: 0
    }
  }));
  assert.equal(summary.percent, 38);
  assert.match(summary.advice, /充裕/);
  assert.equal(logic.quotaSummary({ unlimited_quota: true, total_used: 10 }).unlimited, true);
});

test("sse parser keeps split chunks and stops on DONE", function () {
  const events = [];
  const parser = logic.createSseParser(function (payload) { events.push(payload); });
  parser.push('data: {"choices":[{"delta":{"content":"你');
  parser.push('好"}}]}\n\ndata: [DONE]\n');
  parser.flush();
  assert.equal(events.length, 2);
  assert.deepEqual(logic.sseDelta(events[0]), { content: "你好", reasoning: "" });
  assert.deepEqual(logic.sseDelta(events[1]), { done: true });
  assert.equal(logic.sseDelta('{"error":{"message":"sk-testEXAMPLE12345678 leaked"}}').error.includes("EXAMPLE"), false);
});

test("澄账 classifies usage questions and refuses to invent numbers", function () {
  const L = logic;
  assert.equal(L.classifyLedgerQuestion("我用了多少 token？").intent, "tokens");
  assert.equal(L.classifyLedgerQuestion("这个月花了多少钱？").intent, "money");
  assert.equal(L.classifyLedgerQuestion("这个月花了多少钱？").range, "month");
  assert.equal(L.classifyLedgerQuestion("还剩多少额度？").intent, "remaining");
  assert.equal(L.classifyLedgerQuestion("各模型用了多少？").intent, "byModel");
  assert.equal(L.classifyLedgerQuestion("今天的用量").intent, "today");
  const help = L.answerLedger("你好", {}, new Date("2026-11-16T08:00:00+08:00"));
  assert.equal(help.error, false);
  assert.match(help.text, /澄账只查询/);
  assert.equal(/\d{3,}/.test(help.text), false);
  const remain = L.answerLedger("还剩多少额度？", {
    projectName: "西湖茶事",
    quota: { name: "token-name", total_granted: 1000000, total_used: 12345, total_available: 987655, unlimited_quota: false }
  });
  assert.match(remain.text, /987,655|987655/);
  assert.match(remain.text, /西湖茶事/);
  assert.match(remain.text, /已用额度/);
  assert.equal(remain.text.includes("token-name"), false);
  const now = new Date(2026, 10, 16, 15, 0, 0);
  const byModel = L.answerLedger("各模型用了多少？", {
    logs: [
      { model_name: "deepseek-flash", prompt_tokens: 100, completion_tokens: 20, quota: 500000, created_at: Math.floor(now.getTime() / 1000), type: 2 },
      { model_name: "deepseek-flash", prompt_tokens: 50, completion_tokens: 10, quota: 250000, created_at: Math.floor(now.getTime() / 1000) - 86400, type: 2 }
    ]
  }, now);
  assert.match(byModel.text, /deepseek-flash/);
  assert.match(byModel.text, /180/);
  const today = L.answerLedger("今天的用量", {
    logs: [
      { model_name: "deepseek-flash", prompt_tokens: 100, completion_tokens: 20, quota: 500000, created_at: Math.floor(now.getTime() / 1000), type: 2 },
      { model_name: "old", prompt_tokens: 999, completion_tokens: 1, quota: 1, created_at: Math.floor(now.getTime() / 1000) - 3 * 86400, type: 2 }
    ]
  }, now);
  assert.match(today.text, /120/);
  assert.equal(today.text.includes("999"), false);
  const money = L.answerLedger("这个月花了多少钱？", {
    logs: [
      { model_name: "deepseek-flash", prompt_tokens: 10, completion_tokens: 0, quota: 250000, created_at: Math.floor(now.getTime() / 1000), type: 2 },
      { model_name: "充值", prompt_tokens: 0, completion_tokens: 0, quota: 5000000, created_at: Math.floor(now.getTime() / 1000), type: 1 }
    ]
  }, now);
  assert.match(money.text, /0\.50 美元/);
  assert.equal(money.text.includes("5,000,000") || money.text.includes("5000000"), false);
  const failed = L.answerLedger("各模型用了多少？", { logError: { title: "调用记录接口返回 404。", detail: "" } });
  assert.equal(failed.error, true);
  assert.match(failed.text, /404/);
  assert.match(failed.text, /可能偏少/);
  assert.equal(failed.text.includes("180"), false);
  const withCache = L.answerLedger("用了多少 token？", {
    projectName: "西湖茶事",
    logs: [
      { model_name: "qwen-plus", prompt_tokens: 10, completion_tokens: 4, cache_tokens: 7, quota: 100, created_at: Math.floor(now.getTime() / 1000), type: 2 }
    ]
  }, now);
  assert.match(withCache.text, /输入/);
  assert.match(withCache.text, /输出/);
  assert.match(withCache.text, /缓存/);
  assert.match(withCache.text, /7/);
  assert.equal(withCache.text.includes("没能从记录里单独列出来"), false);
  const noCache = L.answerLedger("用了多少 token？", {
    projectName: "西湖茶事",
    logs: [
      { model_name: "qwen-plus", prompt_tokens: 10, completion_tokens: 4, quota: 100, created_at: Math.floor(now.getTime() / 1000), type: 2 }
    ]
  }, now);
  assert.match(noCache.text, /缓存 token 没能从记录里单独列出来/);
  assert.match(noCache.text, /这些数字可能偏少/);
  const truncated = L.answerLedger("今天的用量", {
    projectName: "西湖茶事",
    truncated: true,
    logs: [
      { model_name: "qwen-plus", prompt_tokens: 3, completion_tokens: 1, cache_tokens: 0, quota: 10, created_at: Math.floor(now.getTime() / 1000), type: 2 }
    ]
  }, now);
  assert.match(truncated.text, /可能偏少/);
  assert.match(truncated.text, /缓存 0|缓存0/);
});

test("chat export is keyed by account and strips gateway keys", function () {
  const key = logic.chatRecordKey("xiaowang", "p1", "docs");
  assert.equal(key.includes("xiaowang"), true);
  assert.notEqual(logic.chatRecordKey("xiaowang", "p1", "docs"), logic.chatRecordKey("other", "p1", "docs"));
  const exported = logic.buildChatExport([
    {
      username: "xiaowang",
      projectId: "p1",
      projectName: "西湖茶事",
      agentKey: "docs",
      messages: [{ role: "assistant", text: "地址见 sk-secretKEY123456", citations: [{ filename: "制度.txt", excerpt: "杭州" }] }]
    }
  ], new Date("2026-11-16T00:00:00Z"));
  assert.match(exported, /西湖茶事/);
  assert.match(exported, /制度\.txt/);
  assert.equal(exported.includes("sk-secretKEY123456"), false);
  assert.match(exported, /对话记录默认只保存在这台浏览器/);
  const storage = { removed: [], removeItem(name) { this.removed.push(name); } };
  logic.purgeLegacySecrets(storage);
  assert.ok(storage.removed.includes("gw.token"));
});

test("admin url follows the page host and keeps the known server as fallback", function () {
  assert.equal(logic.defaultAdminUrl({ protocol: "http:", hostname: "43.110.30.115" }), "http://43.110.30.115:3000");
  assert.equal(logic.defaultAdminUrl({ protocol: "file:", hostname: "" }), "http://43.110.30.115:3000");
  assert.equal(logic.shouldFallbackImage(404), true);
  assert.equal(logic.shouldFallbackImage(401), false);
});
