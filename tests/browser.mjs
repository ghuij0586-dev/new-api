import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(process.env.PUPPETEER_ROOT || "/tmp/gw-test/package.json");
const puppeteer = require("puppeteer-core");

const TOKEN = "sk-testEXAMPLE12345678";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const OUT = "/opt/cursor/artifacts";
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function models() {
  return {
    object: "list",
    data: [
      { id: "qwen-plus", object: "model", owned_by: "alibaba" },
      { id: "qwen-vl-plus", object: "model", owned_by: "alibaba" },
      { id: "wanx2.1-t2i-turbo", object: "model", owned_by: "alibaba" }
    ]
  };
}

const usage = {
  code: true,
  message: "ok",
  data: {
    object: "token_usage",
    name: "同事-01",
    total_granted: 1000000,
    total_used: 380000,
    total_available: 620000,
    unlimited_quota: false,
    model_limits_enabled: false,
    expires_at: 0
  }
};

function startServer() {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".txt": "text/plain"
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const rel = decodeURIComponent(url.pathname);
    let file = path.normalize(path.join(ROOT, rel));
    if (rel.endsWith("/")) file = path.join(ROOT, "index.html");
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function respond(req, status, body, contentType, extra) {
  return req.respond({
    status,
    contentType,
    headers: Object.assign({ "cache-control": "no-store", "x-new-api-version": "v1.0.0-rc.50" }, extra || {}),
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const external = [];
  const pageErrors = [];
  let chatMode = "hello";
  let imageMode = "ok";
  let audioCalls = 0;
  let chatBodies = [];
  let authSeen = false;

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=zh-CN"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("43.110.30.115")) {
      external.push(url);
      req.abort();
      return;
    }
    if (req.headers().authorization && req.headers().authorization.startsWith("Bearer ")) authSeen = true;
    if (url.includes("/v1/models")) {
      respond(req, 200, models());
      return;
    }
    if (url.includes("/api/usage/token")) {
      respond(req, 200, usage);
      return;
    }
    if (url.includes("/v1/chat/completions")) {
      chatBodies.push(req.postData() || "");
      if (chatMode === "xss") {
        const payload = 'data: {"choices":[{"delta":{"content":"<img src=x onerror=\\"window.__xss=1\\">"}}]}\n\ndata: [DONE]\n';
        respond(req, 200, payload, "text/event-stream; charset=utf-8");
        return;
      }
      respond(req, 200, 'data: {"choices":[{"delta":{"content":"你好，同事"}}]}\n\ndata: [DONE]\n', "text/event-stream; charset=utf-8");
      return;
    }
    if (url.includes("/v1/images/generations")) {
      if (imageMode === "missing") {
        respond(req, 404, { error: { message: "无可用渠道 (request id: img404)" } });
        return;
      }
      respond(req, 200, { data: [{ b64_json: TINY_PNG, mime_type: "image/png" }] });
      return;
    }
    if (url.includes("/v1/audio/transcriptions")) {
      audioCalls += 1;
      respond(req, 200, { text: "今天下午对齐了门户" });
      return;
    }
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
      req.continue().catch(() => {});
      return;
    }
    external.push(url);
    req.abort();
  });

  const bad = await browser.newPage();
  await bad.setRequestInterception(true);
  bad.on("request", (req) => {
    const url = req.url();
    if (url.includes("/v1/models")) {
      respond(req, 401, { error: { message: "Invalid token (request id: abc123)", type: "new_api_error" } });
      return;
    }
    if (url.startsWith(origin)) req.continue();
    else req.abort();
  });
  await bad.goto(origin + "/", { waitUntil: "networkidle0" });
  await bad.type("#tokenInput", TOKEN);
  await bad.click("#loginSubmit");
  await bad.waitForFunction(() => {
    const el = document.querySelector("#loginError");
    return el && !el.hidden && el.textContent.includes("令牌无效");
  });
  const denied = await bad.$eval("#loginError", (el) => el.textContent);
  assert.match(denied, /厂商|令牌/);
  assert.equal(denied.includes(TOKEN), false);
  await bad.close();

  await page.goto(origin + "/", { waitUntil: "networkidle0" });
  assert.match(await page.title(), /^融光$/);
  assert.match(await page.$eval("h1", (el) => el.textContent), /^登录融光$/);
  assert.equal(await page.$eval(".wordmark", (el) => el.textContent), "融光");
  assert.equal(await page.$eval(".brand-name", (el) => el.textContent.trim()), "融光");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => document.fonts.check('48px "Rongguang Brush"')), true);
  const brush = await page.evaluate(() => ({
    word: getComputedStyle(document.querySelector(".wordmark")).fontFamily,
    title: getComputedStyle(document.querySelector(".login-card h1")).fontFamily
  }));
  assert.match(brush.word, /Rongguang Brush/);
  assert.match(brush.title, /Rongguang Brush/);
  assert.equal((await page.evaluate(() => document.body.innerText)).includes("多模态聚合网关"), false);
  assert.equal((await page.evaluate(() => document.body.innerText)).includes("内部工作台"), false);
  assert.equal((await page.evaluate(() => document.body.innerText)).includes("内部同事使用"), false);
  await page.screenshot({ path: path.join(OUT, "portal-login.png") });
  await page.type("#nameInput", "小王");
  await page.type("#tokenInput", TOKEN);
  await page.click("#loginSubmit");
  await page.waitForSelector("#panel-home.active h1");
  await page.waitForFunction(() => document.body.innerText.includes("38%"));
  const homeText = await page.evaluate(() => document.body.innerText);
  assert.match(homeText, /工作台/);
  assert.match(homeText, /已连接 · 3 个模型/);
  assert.match(homeText, /看图问答助手/);
  assert.match(homeText, /融光是同事使用的入口/);
  assert.match(homeText, /不是 New API 官方管理后台/);
  assert.equal(homeText.includes("多模态聚合网关"), false);
  assert.equal(homeText.includes("内部工作台"), false);
  assert.equal(homeText.includes("内部同事使用"), false);
  assert.equal(homeText.includes("用户 04"), false);
  assert.equal(homeText.includes("模拟"), false);
  assert.equal(homeText.includes(TOKEN), false);
  await page.screenshot({ path: path.join(OUT, "portal-home.png") });

  await page.click('#nav button[data-tab="agents"]');
  await page.waitForSelector("#panel-agents.active");
  const agentsText = await page.$eval("#panel-agents", (el) => el.innerText);
  assert.match(agentsText, /面向同事/);
  assert.match(agentsText, /文生图助手/);
  assert.equal(agentsText.includes("渠道巡检"), false);
  await page.screenshot({ path: path.join(OUT, "portal-agents.png") });

  await page.evaluate(() => document.querySelector('#panel-agents [data-agent="qa"]').click());
  await page.waitForSelector("#panel-chat.active");
  await page.click('#chips button');
  await page.click("#sendBtn");
  await page.waitForFunction(() => document.body.innerText.includes("你好，同事"));
  assert.equal(chatBodies.length > 0, true);
  assert.match(chatBodies[0], /qwen-turbo|qwen-plus/);
  const chatHtml = await page.$eval("#log", (el) => el.innerHTML);
  assert.equal(chatHtml.includes("<img"), false);
  await page.screenshot({ path: path.join(OUT, "portal-chat.png") });

  chatMode = "xss";
  await page.type("#prompt", "再答一次");
  await page.click("#sendBtn");
  await page.waitForFunction(() => document.body.innerText.includes("onerror"));
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.$eval("#log", (el) => el.querySelectorAll("img").length), 0);

  await page.evaluate(() => document.querySelector('#panel-agents [data-agent="vision"]').click());
  await page.waitForSelector("#attachRow:not([hidden])");
  await page.click("#sampleImage");
  await page.type("#prompt", "这张图里写了哪些文字？");
  const before = chatBodies.length;
  await page.click("#sendBtn");
  for (let i = 0; i < 40 && chatBodies.length <= before; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const visionBody = chatBodies[before];
  assert.match(visionBody, /image_url/);
  assert.match(visionBody, /data:image\/png;base64,/);
  assert.match(visionBody, /qwen-vl-plus/);

  imageMode = "missing";
  await page.evaluate(() => document.querySelector('#panel-agents [data-agent="image"]').click());
  await page.waitForFunction(() => document.querySelector("#sendBtn").textContent === "生成");
  await page.type("#prompt", "一只橘猫");
  await page.click("#sendBtn");
  await page.waitForFunction(() => document.body.innerText.includes("生图接口还没有配置好") || document.body.innerText.includes("没有找到这个模型"));
  const imageErrorHtml = await page.$eval("#log", (el) => el.innerHTML);
  assert.equal(imageErrorHtml.includes("<img"), false);
  assert.equal((await page.evaluate(() => document.body.innerText)).includes("模拟出图"), false);

  imageMode = "ok";
  await page.click("#clearChat");
  await page.type("#prompt", "浅色背景的架构图");
  await page.click("#sendBtn");
  await page.waitForSelector("#log .preview img");
  const src = await page.$eval("#log .preview img", (img) => img.getAttribute("src"));
  assert.match(src, /^data:image\/png;base64,/);
  await page.screenshot({ path: path.join(OUT, "portal-image.png") });

  await page.evaluate(() => document.querySelector('#panel-agents [data-agent="audio"]').click());
  await page.waitForFunction(() => (document.querySelector("#modeNote") || {}).textContent.includes("尚未接入"));
  const audioFile = path.join(OUT, "tiny.wav");
  fs.writeFileSync(audioFile, Buffer.from("RIFF"));
  const input = await page.$("#audioInput");
  await input.uploadFile(audioFile);
  await page.click("#sendBtn");
  await page.waitForFunction(() => (document.querySelector("#composerError") || {}).textContent.includes("尚未接入"));
  assert.equal(audioCalls, 0);
  assert.equal((await page.evaluate(() => document.body.innerText)).includes("今天下午对齐了网关的接入范围"), false);

  await page.click('#nav button[data-tab="quota"]');
  await page.waitForSelector("#panel-quota.active");
  const quotaText = await page.$eval("#panel-quota", (el) => el.innerText);
  assert.match(quotaText, /38%/);
  assert.match(quotaText, /同事-01/);
  assert.equal(quotaText.includes("用户 04"), false);
  assert.equal(quotaText.includes(TOKEN), false);
  assert.match(quotaText, /sk-test\*\*\*\*/);
  await page.screenshot({ path: path.join(OUT, "portal-quota.png") });

  await page.click("#userBtn");
  await page.waitForSelector("#settings[open]");
  await page.click("#setAdmin");
  await page.click("#saveSettings");
  await page.waitForSelector("#navChannels:not([hidden])");
  await page.click("#navChannels");
  await page.waitForSelector("#panel-channels.active");
  const channelText = await page.$eval("#panel-channels", (el) => el.innerText);
  assert.match(channelText, /阿里云百炼/);
  assert.match(channelText, /qwen-plus/);
  assert.equal(channelText.includes("218 ms"), false);
  assert.match(channelText, /令牌可调用/);
  await page.screenshot({ path: path.join(OUT, "portal-channels.png") });

  await page.evaluate(() => document.querySelector('#nav button[data-tab="home"]').click());
  await page.waitForSelector("#panel-home.active");
  await page.click("#themeBtn");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.screenshot({ path: path.join(OUT, "portal-dark.png") });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark" && document.body.innerText.includes("工作台"));

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluate(() => document.querySelector('#nav button[data-tab="home"]').click());
  await page.waitForSelector("#panel-home.active");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow < 8, "mobile page overflows by " + overflow);
  await page.screenshot({ path: path.join(OUT, "portal-mobile.png") });

  assert.equal(authSeen, true);
  assert.deepEqual(external, []);
  const html = await page.content();
  assert.equal(html.includes(TOKEN), false);
  const serious = pageErrors.filter((item) => !/favicon|Failed to load resource/i.test(item));
  assert.deepEqual(serious, [], serious.join("\n"));

  await browser.close();
  server.close();
  console.log("browser checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
