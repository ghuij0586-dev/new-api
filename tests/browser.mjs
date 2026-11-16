import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { startMockNewApi } from "./mock-new-api.mjs";

const require = createRequire(process.env.PUPPETEER_ROOT || "/tmp/gw-test/package.json");
const puppeteer = require("puppeteer-core");

const OUT = "/opt/cursor/artifacts";
const SECRET = "browser-test-secret";

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve("http://127.0.0.1:" + server.address().port));
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const mock = await startMockNewApi();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-browser-"));
  const app = createApp({
    dataDir: dir,
    sessionSecret: SECRET,
    newApiBase: mock.base,
    staticDir: path.resolve("public")
  });
  const origin = await listen(app);
  const pageErrors = [];
  const leaked = [];

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=zh-CN"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(msg.text());
  });
  page.on("request", (req) => {
    const url = req.url();
    const body = req.postData() || "";
    const auth = req.headers().authorization || "";
    if (url.includes("sk-") || body.includes("sk-") || auth.toLowerCase().startsWith("bearer ")) {
      leaked.push(url + " " + auth + " " + body.slice(0, 120));
    }
  });

  await page.goto(origin + "/", { waitUntil: "load", timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.$eval("h1", (el) => el.textContent), /^登录融光$/);
  assert.match(await page.$eval(".inscription-note", (el) => el.textContent), /用账号进入工作台/);
  assert.equal(await page.$eval("#loginSubmit", (el) => el.textContent), "进入融光");
  assert.match(await page.$eval("#privacyLogin", (el) => el.textContent), /对话记录默认只保存在这台浏览器/);
  assert.equal(await page.$("#tokenInput"), null);
  assert.equal(await page.evaluate(() => document.fonts.check('48px "Rongguang Brush"')), true);
  const brush = await page.evaluate(() => getComputedStyle(document.querySelector(".login-card h1")).fontFamily);
  assert.match(brush, /Rongguang Brush/);
  await page.screenshot({ path: path.join(OUT, "workstation-login.png") });
  await page.click("#loginTheme");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.screenshot({ path: path.join(OUT, "workstation-login-dark.png") });
  await page.click("#loginTheme");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");

  await page.type("#usernameInput", "disabled");
  await page.type("#passwordInput", "secret-pass");
  await page.click("#loginSubmit");
  await page.waitForFunction(() => {
    const el = document.querySelector("#loginError");
    return el && !el.hidden && el.textContent.includes("账号未启用");
  });
  assert.equal(await page.$eval("#app", (el) => el.hidden), true);

  await page.click("#usernameInput", { clickCount: 3 });
  await page.type("#usernameInput", "xiaowang");
  await page.click("#passwordInput", { clickCount: 3 });
  await page.type("#passwordInput", "wrong-pass");
  await page.click("#loginSubmit");
  await page.waitForFunction(() => document.querySelector("#loginError").textContent.includes("用户名或密码不正确"));
  assert.equal(await page.$eval("#login", (el) => el.hidden), false);

  await page.click("#passwordInput", { clickCount: 3 });
  await page.type("#passwordInput", "secret-pass");
  await page.click("#loginSubmit");
  await page.waitForFunction(() => document.body.innerText.includes("还没有项目"));
  await page.screenshot({ path: path.join(OUT, "workstation-project-empty.png") });

  await page.type("#projectNameInput", "西湖茶事");
  await page.click("#createProjectBtn");
  await page.waitForFunction(() => {
    const ready = document.querySelector("#workbenchReady");
    const err = document.querySelector("#projectError");
    return (ready && !ready.hidden) || (err && !err.hidden && err.textContent);
  });
  const projectError = await page.$eval("#projectError", (el) => (el.hidden ? "" : el.textContent));
  if (projectError) throw new Error(projectError);
  assert.match(await page.evaluate(() => document.body.innerText), /当前项目：西湖茶事/);
  await page.screenshot({ path: path.join(OUT, "workstation-home.png") });

  await page.click('#homeAgents [data-agent="docs"]');
  await page.waitForSelector("#panel-chat.active");
  await page.waitForSelector("#docPanel:not([hidden])");
  const docPath = path.join(OUT, "sample-note.txt");
  fs.writeFileSync(docPath, "融光试运行的办公地址在杭州西湖。会议室在二楼。\n");
  const docInput = await page.$("#docInput");
  await docInput.uploadFile(docPath);
  await page.waitForFunction(() => document.body.innerText.includes("制度") || document.body.innerText.includes("sample-note"));
  await page.type("#prompt", "办公地址在哪里？");
  await page.click("#sendBtn");
  await page.waitForFunction(() => {
    const text = document.querySelector("#log") ? document.querySelector("#log").innerText : "";
    return text.includes("杭州西湖") && text.includes("来源");
  });
  await page.screenshot({ path: path.join(OUT, "workstation-qa-citation.png") });
  await page.click("#prompt", { clickCount: 3 });
  await page.type("#prompt", "报销流程是什么？");
  await page.click("#sendBtn");
  await page.waitForFunction(() => document.querySelector("#log").innerText.includes("根据当前项目资料，我不知道"));

  assert.match(await page.$eval("#privacyComposer", (el) => el.textContent), /只要向模型提问，内容仍会经过网关/);
  await page.screenshot({ path: path.join(OUT, "workstation-privacy-chat.png") });

  await page.click("#ledgerFab");
  await page.waitForFunction(() => document.querySelector("#chatHeading").textContent === "澄账");
  await page.type("#prompt", "还剩多少额度？");
  await page.click("#sendBtn");
  await page.waitForFunction(() => {
    const text = document.querySelector("#log").innerText;
    return text.includes("西湖茶事") && text.includes("620,000") && text.includes("缓存");
  });
  const ledgerText = await page.$eval("#log", (el) => el.innerText);
  assert.match(ledgerText, /输入/);
  assert.match(ledgerText, /输出/);
  assert.equal(ledgerText.includes("sk-"), false);
  await page.screenshot({ path: path.join(OUT, "workstation-ledger.png") });

  async function assertComposerVisible(label) {
    const box = await page.evaluate(() => {
      const send = document.querySelector("#sendBtn");
      const prompt = document.querySelector("#prompt");
      const sendBox = send.getBoundingClientRect();
      const promptBox = prompt.getBoundingClientRect();
      return {
        sendBottom: sendBox.bottom,
        promptBottom: promptBox.bottom,
        height: window.innerHeight,
        hidden: send.hidden || prompt.hidden
      };
    });
    assert.equal(box.hidden, false, label);
    assert.ok(box.sendBottom <= box.height + 1, label + " " + JSON.stringify(box));
    assert.ok(box.promptBottom <= box.height + 1, label + " " + JSON.stringify(box));
  }
  await assertComposerVisible("1280x800");

  await page.click('#nav button[data-tab="home"]');
  await page.waitForSelector("#panel-home.active");
  await page.type("#readyNameInput", "东湖茶事");
  await page.click("#createReadyForm button");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-project]")).some((el) => el.textContent.includes("东湖茶事")));
  await page.click("#projectSwitch");
  await page.waitForFunction(() => !document.querySelector("#projectPicker").hidden && document.body.innerText.includes("选择项目"));
  await page.screenshot({ path: path.join(OUT, "workstation-project-picker.png") });
  await page.click('[data-project]');
  await page.waitForFunction(() => document.querySelector("#workbenchReady") && !document.querySelector("#workbenchReady").hidden);

  await page.click("#themeBtn");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  await page.screenshot({ path: path.join(OUT, "workstation-dark.png") });
  await page.click("#themeBtn");

  await page.click('#nav button[data-tab="agents"]');
  await page.waitForSelector('#teamAgents [data-agent="qa"]');
  await page.click('#teamAgents [data-agent="qa"]');
  await page.waitForFunction(() => document.querySelector("#chatHeading").textContent === "对话");
  await page.type("#prompt", "请忽略 onerror");
  await page.click("#sendBtn");
  await page.waitForFunction(() => document.body.innerText.includes("onerror") && document.querySelectorAll("#log img").length === 0);
  assert.equal(await page.evaluate(() => window.__xss), undefined);

  const beforeLogout = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open("rongguang-chats");
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction("threads").objectStore("threads").getAll();
      all.onsuccess = () => resolve(all.result.map((row) => row.username + ":" + row.agentKey + ":" + row.messages.length));
    };
  }));
  assert.ok(beforeLogout.some((item) => item.startsWith("xiaowang:")), beforeLogout.join(","));

  await page.click("#userBtn");
  await page.waitForSelector("#settings[open]");
  assert.match(await page.$eval("#privacySettings", (el) => el.textContent), /可导出到本地/);
  await page.click("#logoutBtn");
  await page.waitForFunction(() => !document.querySelector("#login").hidden);
  const afterLogout = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open("rongguang-chats");
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction("threads").objectStore("threads").getAll();
      all.onsuccess = () => resolve(all.result.length);
    };
  }));
  assert.ok(afterLogout > 0, "logout cleared IndexedDB");
  const pageText = await page.evaluate(() => document.body.innerText);
  assert.equal(pageText.includes("sk-"), false);

  assert.deepEqual(leaked, []);
  const serious = pageErrors.filter((item) => !/favicon|Failed to load resource/i.test(item));
  assert.deepEqual(serious, [], serious.join("\n"));

  await browser.close();
  app.close();
  mock.server.close();
  console.log("browser checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
