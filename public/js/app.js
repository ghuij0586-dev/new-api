(function () {
  var L = window.GatewayLogic;
  var ICONS = {
    blue: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><path d="M9 14.5c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2"/></svg>',
    violet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    teal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V7l8-3 8 3v12"/><path d="M8 10h8M8 14h8M8 18h8"/></svg>',
    orange: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m21 16-5-5-4 4-2-2-5 5"/></svg>',
    green: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><path d="M8 13a4 4 0 0 1 8 0"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M12 14v5M9 19h6"/></svg>',
    chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  };
  var AGENTS = [
    { key: "write", mode: "text", icon: "teal", pill: "写作", title: "写作", desc: "改写、起草和翻译。用量记在当前项目上。", tags: ["对话"], samples: ["把这段话改得更适合发给客户：\n", "把下面的内容翻译成英文：\n"], system: "你是写作助手。用准确的中文改写或起草。保留原意。用户要求翻译时再用目标语言。" },
    { key: "notes", mode: "text", icon: "teal", pill: "纪要", title: "纪要", desc: "把会议记录整理成结论和待办。", tags: ["对话"], samples: ["把下面的会议记录整理成结论和待办：\n"], system: "你是会议纪要助手。分成「结论」和「待办」。待办写清事项；原文里有负责人就保留。不要编造没有说过的决定。" },
    { key: "docs", mode: "docs", icon: "violet", pill: "资料", title: "项目问答", desc: "只根据这个项目上传的资料回答，并注明出处。资料里没有的，会直接说不知道。", tags: ["出处"], samples: ["这份资料里的办公地址在哪里？", "资料里有没有提到报销？"], system: "" },
    { key: "qa", mode: "text", icon: "violet", pill: "", title: "对话", desc: "直接和模型对话。用量记在当前项目上。", tags: ["对话"], samples: ["用三句话说明今天要同步的事项。"], system: "你是同事的助手。用准确、好读的中文回答。不确定就说明不确定。" },
    { key: "vision", mode: "vision", icon: "blue", pill: "", title: "看图", desc: "解读截图和文档照片。用量记在当前项目上。", tags: ["识图"], samples: ["这张图里写了哪些文字？", "帮我总结这张截图的要点。"], system: "你是看图助手。请用简洁中文回答。先依据图片里真正看得见的内容说明。图中没有的信息不要编造。如果没有收到图片，请直接说明需要一张图。" },
    { key: "image", mode: "image", icon: "orange", pill: "额度", pillClass: "soon", title: "文生图", desc: "按描述出示意图。用量记在当前项目上。", tags: ["生图"], samples: ["浅色背景的产品架构示意图，扁平插画，留白充足"], system: "" },
    { key: "audio", mode: "audio", icon: "green", pill: "", title: "语音转写", desc: "把录音转成文字。没有语音模型时不会编造文字。", tags: ["语音"], samples: [], system: "" }
  ];
  var LEDGER = {
    key: "ledger",
    mode: "ledger",
    title: "澄账",
    desc: "查询当前项目的剩余额度、已用额度，以及输入、输出和缓存 token。",
    samples: ["还剩多少额度？", "用了多少 token？", "这个月花了多少钱？", "各模型用了多少？", "今天的用量"]
  };
  var TABS = { home: "工作台", agents: "智能体", chat: "对话" };
  var DB_NAME = "rongguang-chats";
  var DB_STORE = "threads";

  var state = {
    username: "",
    name: "",
    projects: [],
    projectId: "",
    docs: [],
    models: [],
    usage: null,
    connected: false,
    connError: "",
    loading: false,
    calls: 0,
    tab: "home",
    agentKey: "write",
    modelId: "",
    filter: "",
    messages: [],
    attachment: null,
    audioFile: null,
    sending: false,
    abort: null
  };
  var ignoreHash = false;

  function $(id) { return document.getElementById(id); }
  function storeGet(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
  function storeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function nameMap() { try { return JSON.parse(storeGet("gw.displayNames") || "{}") || {}; } catch (e) { return {}; } }
  function saveNameMap(map) { storeSet("gw.displayNames", JSON.stringify(map)); }

  function currentAgent() {
    if (state.agentKey === "ledger") return LEDGER;
    return AGENTS.filter(function (agent) { return agent.key === state.agentKey; })[0] || AGENTS[0];
  }
  function currentProject() {
    for (var i = 0; i < state.projects.length; i++) {
      if (state.projects[i].id === state.projectId) return state.projects[i];
    }
    return null;
  }
  function projectPath(suffix) {
    return "/api/rg/projects/" + encodeURIComponent(state.projectId) + suffix;
  }
  function ledgerAvatar() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<circle cx="32" cy="32" r="30.25" fill="none" stroke="currentColor" stroke-width="1.25"/><circle cx="32" cy="26" r="8.5" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M28.2 25.2h2.4M33.4 25.2h2.4" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><path d="M29.2 29.2c1.6 1.3 4 1.3 5.6 0" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round"/><path d="M18 49.5c2.4-8.2 25.2-8.2 28 0" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/><path class="ledger-seal" d="M47.2 40.6l1.05 2.7 2.85.95-2.85.95-1.05 2.7-1.05-2.7-2.85-.95 2.85-.95z"/>';
    return svg;
  }
  function currentModel() {
    for (var i = 0; i < state.models.length; i++) {
      if (state.models[i].id === state.modelId) return state.models[i];
    }
    return null;
  }
  function visibleModels() {
    var q = state.filter.trim().toLowerCase();
    return state.models.filter(function (model) {
      if (!q) return true;
      return (model.id + " " + model.displayName + " " + model.vendor).toLowerCase().indexOf(q) !== -1;
    }).slice().sort(function (a, b) {
      return (L.scoreModel(b, state.agentKey) - L.scoreModel(a, state.agentKey)) || a.id.localeCompare(b.id);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    var dark = theme === "dark";
    $("themeLabel").textContent = dark ? "切换为浅色" : "切换为深色";
    $("loginTheme").textContent = dark ? "浅色" : "深色";
    document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#12100e" : "#f3eee4");
    storeSet(L.THEME_KEY, dark ? "dark" : "light");
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  }

  function showLoginError(text) {
    var box = $("loginError");
    box.hidden = !text;
    box.textContent = text || "";
  }
  function setLoginBusy(busy) {
    $("loginSubmit").disabled = busy;
    $("loginSubmit").textContent = busy ? "正在验证…" : "进入融光";
  }
  function setProjectError(text) {
    var box = $("projectError");
    box.hidden = !text;
    box.textContent = text || "";
  }
  function setComposerError(text) {
    var box = $("composerError");
    box.hidden = !text;
    box.textContent = text || "";
  }
  function setDocError(text) {
    var box = $("docError");
    box.hidden = !text;
    box.textContent = text || "";
  }

  async function readPayload(res) {
    var raw = "";
    try { raw = await res.text(); } catch (e) { raw = ""; }
    var json = {};
    try { json = raw ? JSON.parse(raw) : {}; } catch (e) { json = { message: raw.slice(0, 180) }; }
    var msg = (json.error && (json.error.message || json.error.msg)) || json.message || "";
    return { json: json, message: L.redact(msg).trim(), raw: raw };
  }

  function apiFetch(path, options) {
    var opt = options || {};
    var headers = new Headers(opt.headers || {});
    headers.delete("Authorization");
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, opt.timeout || 120000);
    if (opt.signal) {
      if (opt.signal.aborted) ctrl.abort();
      else opt.signal.addEventListener("abort", function () { ctrl.abort(); }, { once: true });
    }
    var init = { method: opt.method || "GET", headers: headers, credentials: "same-origin", signal: ctrl.signal, cache: "no-store" };
    if (opt.body != null) init.body = opt.body;
    return fetch(path, init).then(function (res) {
      if (res.status !== 401) return res;
      return res.clone().text().then(function (raw) {
        if (raw.indexOf('"code":"session"') !== -1 || raw.indexOf('"code": "session"') !== -1) {
          forceLogout("登录已失效，请重新登录。");
          var expired = new Error("session");
          expired.network = "session";
          throw expired;
        }
        return res;
      });
    }).catch(function (err) {
      if (err && err.network === "session") throw err;
      var wrapped = new Error(timedOut ? "timeout" : (err && err.name === "AbortError" ? "abort" : "network"));
      wrapped.network = timedOut ? "timeout" : (err && err.name === "AbortError" ? "abort" : "network");
      throw wrapped;
    }).finally(function () { clearTimeout(timer); });
  }

  function explainThrown(err, context) {
    if (err && err.network === "session") return { title: "登录已失效，请重新登录。", detail: "" };
    return L.explainHttpError({ status: 0, network: err && err.network ? err.network : "network", context: context || "" });
  }
  function joinExplain(explained) {
    return explained.detail ? explained.title + " " + explained.detail : explained.title;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error("no-idb")); return; }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function threadId() {
    return L.chatRecordKey(state.username, state.projectId, state.agentKey);
  }
  function serialMessages() {
    return state.messages.filter(function (msg) { return !msg.pending; }).map(function (msg) {
      return {
        role: msg.role,
        who: msg.who || "",
        text: msg.text || "",
        error: !!msg.error,
        citations: msg.citations || []
      };
    });
  }
  async function saveThread() {
    if (!state.username || !state.projectId) return;
    try {
      var db = await openDb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        var project = currentProject();
        tx.objectStore(DB_STORE).put({
          id: threadId(),
          username: state.username,
          projectId: state.projectId,
          projectName: project ? project.name : "",
          agentKey: state.agentKey,
          updatedAt: new Date().toISOString(),
          messages: serialMessages()
        });
      });
      db.close();
    } catch (e) {}
  }
  async function loadThread() {
    state.messages = [];
    showEmpty();
    if (!state.username || !state.projectId) return;
    try {
      var db = await openDb();
      var rec = await new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readonly");
        var req = tx.objectStore(DB_STORE).get(threadId());
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      db.close();
      if (!rec || !rec.messages) return;
      $("log").replaceChildren();
      state.messages = [];
      rec.messages.forEach(function (msg) { pushMessage(msg); });
      if (!state.messages.length) showEmpty();
    } catch (e) {}
  }
  async function clearStoredThread() {
    if (!state.username || !state.projectId) return;
    try {
      var db = await openDb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, "readwrite");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(DB_STORE).delete(threadId());
      });
      db.close();
    } catch (e) {}
  }
  async function exportChats() {
    var db = await openDb();
    var rows = await new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, "readonly");
      var req = tx.objectStore(DB_STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
    db.close();
    var mine = rows.filter(function (row) { return row.username === state.username; });
    var blob = new Blob([L.buildChatExport(mine, new Date())], { type: "application/json" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "rongguang-chats.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  function renderStatus() {
    var badge = $("statusBadge");
    var text = $("statusText");
    badge.classList.remove("ok", "bad");
    if (!state.projectId) {
      text.textContent = state.projects.length ? "请选择项目" : "请创建项目";
    } else if (state.loading) {
      text.textContent = "正在连接";
    } else if (state.connected) {
      badge.classList.add("ok");
      text.textContent = "已连接 · " + state.models.length + " 个模型";
    } else {
      badge.classList.add("bad");
      text.textContent = "未连上网关";
    }
    var banner = $("banner");
    if (state.connError) {
      banner.hidden = false;
      $("bannerText").textContent = state.connError;
    } else banner.hidden = true;
  }
  function renderUser() {
    var name = state.name || state.username || "同事";
    $("userLabel").textContent = name;
    $("avatar").textContent = name.slice(0, 1) || "同";
  }
  function renderProjects() {
    var picked = currentProject();
    var empty = !state.projects.length;
    $("projectEmpty").hidden = !empty;
    $("projectPicker").hidden = empty || !!picked;
    $("workbenchReady").hidden = !picked;
    $("projectSwitch").textContent = picked ? picked.name : (empty ? "创建项目" : "选择项目");
    if (picked) $("readyProjectName").textContent = "当前项目：" + picked.name;
    var list = $("projectList");
    list.replaceChildren();
    state.projects.forEach(function (project) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.project = project.id;
      button.textContent = project.name;
      if (project.id === state.projectId) button.className = "on";
      list.append(button);
    });
  }
  function renderMetrics() {
    var caps = L.capabilitySet(state.models);
    var quota = L.quotaSummary(state.usage);
    var quotaValue = "—";
    var quotaHint = "选择项目后读取";
    if (state.usage && quota.known) {
      if (quota.unlimited) { quotaValue = "不限额"; quotaHint = "仍会计入调用"; }
      else if (quota.percent == null) { quotaValue = L.formatCount(quota.used); quotaHint = "已用额度点"; }
      else { quotaValue = quota.percent + "%"; quotaHint = "已用 " + L.formatCount(quota.used) + " / " + L.formatCount(quota.granted); }
    }
    var project = currentProject();
    var items = [
      ["当前项目", project ? project.name : "—", "钥匙只留在服务器"],
      ["已用额度", quotaValue, quotaHint],
      ["能力覆盖", state.connected ? (caps.count ? caps.count + " 类" : "0") : "—", caps.labels.length ? caps.labels.join(" · ") : "对话 · 识图 · 生图 · 语音"],
      ["项目资料", String(state.docs.length), "供项目问答引用"]
    ];
    var root = $("metrics");
    root.replaceChildren();
    items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "metric";
      var span = document.createElement("span");
      span.textContent = item[0];
      var strong = document.createElement("b");
      strong.textContent = item[1];
      var em = document.createElement("em");
      em.textContent = item[2];
      card.append(span, strong, em);
      root.append(card);
    });
  }
  function audioReady() { return state.models.some(function (model) { return model.kinds.indexOf("audio") !== -1; }); }
  function imageReady() { return state.models.some(function (model) { return model.kinds.indexOf("image") !== -1; }); }
  function renderAgentCard(agent) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "agent";
    button.dataset.agent = agent.key;
    var top = document.createElement("div");
    top.className = "agent-top";
    var icon = document.createElement("div");
    icon.className = "icon " + agent.icon;
    icon.innerHTML = ICONS[agent.icon];
    top.append(icon);
    var pillText = agent.pill;
    var pillClass = agent.pillClass || "";
    if (agent.key === "audio" && state.connected && !audioReady()) { pillText = "尚未接入"; pillClass = "soon"; }
    if (pillText) {
      var pill = document.createElement("span");
      pill.className = "pill" + (pillClass ? " " + pillClass : "");
      pill.textContent = pillText;
      top.append(pill);
    }
    var title = document.createElement("h3");
    title.textContent = agent.title;
    var desc = document.createElement("p");
    desc.textContent = agent.desc;
    var tags = document.createElement("div");
    tags.className = "tags";
    agent.tags.forEach(function (tag) {
      var span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      tags.append(span);
    });
    button.append(top, title, desc, tags);
    return button;
  }
  function renderLedgerCard() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "agent agent-ledger";
    button.dataset.agent = "ledger";
    var face = document.createElement("span");
    face.className = "ledger-avatar";
    face.append(ledgerAvatar());
    var body = document.createElement("span");
    body.className = "ledger-copy";
    var title = document.createElement("h3");
    title.textContent = LEDGER.title;
    var desc = document.createElement("p");
    desc.textContent = LEDGER.desc;
    body.append(title, desc);
    button.append(face, body);
    return button;
  }
  function renderAgents() {
    $("homeAgents").replaceChildren.apply($("homeAgents"), AGENTS.slice(0, 3).map(renderAgentCard));
    $("ledgerEntry").replaceChildren(renderLedgerCard());
    $("teamAgents").replaceChildren.apply($("teamAgents"), AGENTS.map(renderAgentCard));
  }
  function renderDocs() {
    var list = $("docList");
    list.replaceChildren();
    if (!state.docs.length) {
      var empty = document.createElement("li");
      empty.className = "fine";
      empty.textContent = "还没有资料。";
      list.append(empty);
      return;
    }
    state.docs.forEach(function (doc) {
      var item = document.createElement("li");
      item.className = "doc-row";
      var name = document.createElement("span");
      name.textContent = doc.filename + (doc.clipped ? "（只保留了前一部分）" : "");
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "linkish";
      remove.dataset.doc = doc.id;
      remove.textContent = "移除";
      item.append(name, remove);
      list.append(item);
    });
  }
  function renderModels() {
    var root = $("modelList");
    var models = visibleModels();
    root.replaceChildren();
    if (!state.projectId) {
      var need = document.createElement("p");
      need.className = "fine";
      need.textContent = "先选择项目。";
      root.append(need);
      return;
    }
    if (!state.models.length) {
      var empty = document.createElement("p");
      empty.className = "fine";
      empty.textContent = state.connected ? "当前项目下面没有模型。" : "还没有读到模型列表。";
      root.append(empty);
      return;
    }
    models.forEach(function (model) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "model" + (model.id === state.modelId ? " on" : "");
      button.dataset.id = model.id;
      var strong = document.createElement("strong");
      strong.textContent = model.displayName;
      var vendor = document.createElement("div");
      vendor.className = "vendor";
      vendor.textContent = model.displayName === model.id ? model.vendor : model.id + " · " + model.vendor;
      var tags = document.createElement("div");
      tags.className = "tags";
      model.tags.forEach(function (tag) {
        var span = document.createElement("span");
        span.className = "tag";
        span.textContent = tag;
        tags.append(span);
      });
      button.append(strong, vendor, tags);
      root.append(button);
    });
  }
  function renderComposer() {
    var agent = currentAgent();
    var model = currentModel();
    var project = currentProject();
    var ledger = agent.mode === "ledger";
    $("content").classList.toggle("ledger-mode", ledger);
    var heading = ledger ? "澄账" : agent.title;
    $("chatHeading").textContent = heading;
    $("chatLead").textContent = ledger
      ? "问当前项目还剩多少额度、花了多少钱、输入输出和缓存 token。数字来自网关，失败时说明可能偏少。"
      : agent.mode === "docs"
        ? "只根据当前项目的资料回答。资料里没有的内容，会说不知道，并注明出处。"
        : "发送后会真实调用网关，并记在当前项目上。失败时直接显示原因。";
    $("prompt").placeholder = ledger ? "问当前项目的用量，例如：还剩多少额度？" : "输入要发送的内容，Enter 换行，Ctrl + Enter 发送";
    $("playKicker").textContent = agent.title;
    $("playTitle").textContent = ledger ? "澄账" : (agent.mode === "docs" ? "项目问答" : (model ? model.displayName : "未选择模型"));
    $("playHint").textContent = project ? agent.desc + " 项目：" + project.name + "。" : agent.desc;
    var chips = $("chips");
    chips.replaceChildren();
    agent.samples.forEach(function (sample) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.sample = sample;
      button.textContent = sample.replace(/\s+/g, " ").slice(0, 22);
      chips.append(button);
    });
    chips.hidden = !agent.samples.length;
    $("attachRow").hidden = agent.mode !== "vision";
    $("audioRow").hidden = agent.mode !== "audio";
    $("prompt").hidden = agent.mode === "audio";
    $("docPanel").hidden = agent.mode !== "docs";
    $("modelPanel").hidden = ledger;
    var note = $("modeNote");
    note.hidden = true;
    note.textContent = "";
    if (!project) {
      note.hidden = false;
      note.textContent = state.projects.length ? "请先在工作台选择一个项目。" : "请先在工作台创建一个项目。";
    } else if (agent.mode === "audio" && state.connected && !audioReady()) {
      note.hidden = false;
      note.textContent = "模型列表里还没有识别到语音模型，转写尚未接入。融光不会编造文字。";
    } else if (agent.mode === "image" && state.connected && !imageReady()) {
      note.hidden = false;
      note.textContent = "模型列表里还没有识别到生图模型。如果网关未配置，会显示错误，不会展示假图片。";
    }
    var meta = project ? "项目「" + project.name + "」" : "未选项目";
    if (!ledger && model) meta = model.id + " · " + meta;
    if (ledger) meta = "只查当前项目，不调用对话模型";
    $("modelMeta").textContent = meta;
    $("sendBtn").textContent = agent.mode === "image" ? "生成" : (agent.mode === "audio" ? "转写" : "发送");
    $("sendBtn").hidden = state.sending;
    $("stopBtn").hidden = !state.sending;
    renderAttachment();
  }
  function renderAttachment() {
    var preview = $("attachPreview");
    if (!state.attachment) {
      preview.hidden = true;
      preview.replaceChildren();
      $("attachState").textContent = "未附图。也可以直接粘贴截图。";
      return;
    }
    preview.hidden = false;
    preview.replaceChildren();
    var img = document.createElement("img");
    img.alt = "待发送的图片";
    img.src = state.attachment.dataUrl;
    var name = document.createElement("span");
    name.className = "fine";
    name.textContent = state.attachment.name || "已附图";
    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "linkish";
    remove.id = "removeImage";
    remove.textContent = "移除";
    preview.append(img, name, remove);
    $("attachState").textContent = "已附图";
  }
  function renderFooter() {
    $("footerNote").textContent = "融光是同事使用的入口，不是 New API 官方管理后台。厂商密钥和项目钥匙只留在服务器上。" + L.PRIVACY_NOTICE;
  }

  function nearBottom(el) { return el.scrollHeight - el.scrollTop - el.clientHeight < 90; }
  function scrollLog(force) {
    var log = $("log");
    if (force || log.dataset.stick === "1") log.scrollTop = log.scrollHeight;
  }
  function fillBubble(bubble, text) {
    bubble.replaceChildren();
    String(text || "").split("\n").forEach(function (line, index) {
      if (index) bubble.append(document.createElement("br"));
      bubble.append(document.createTextNode(line));
    });
  }
  function paintMessage(msg) {
    var bubble = msg.node.querySelector(".bubble");
    if (msg.pending && !msg.text) {
      bubble.replaceChildren();
      var typing = document.createElement("div");
      typing.className = "typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      bubble.append(typing);
    } else fillBubble(bubble, msg.text);
    bubble.classList.toggle("error", !!msg.error);
    if (msg.citations && msg.citations.length) {
      var cites = document.createElement("div");
      cites.className = "cites";
      msg.citations.forEach(function (cite) {
        var item = document.createElement("div");
        item.className = "cite";
        var name = document.createElement("strong");
        name.textContent = cite.filename || "资料";
        var excerpt = document.createElement("p");
        excerpt.textContent = cite.excerpt || "";
        item.append(name, excerpt);
        cites.append(item);
      });
      bubble.append(cites);
    }
    if (msg.imageUrl && L.safeImageSrc(msg.imageUrl)) {
      var box = document.createElement("div");
      box.className = "preview";
      var img = document.createElement("img");
      img.alt = msg.role === "user" ? "发送的图片" : "生成的图片";
      img.src = L.safeImageSrc(msg.imageUrl);
      box.append(img);
      bubble.append(box);
    }
    msg.node.querySelector(".who").textContent = msg.who || "";
  }
  function pushMessage(partial) {
    var msg = {
      role: partial.role,
      who: partial.who || "",
      text: partial.text || "",
      apiText: partial.apiText || partial.text || "",
      imageUrl: partial.imageUrl || "",
      citations: partial.citations || [],
      error: !!partial.error,
      pending: !!partial.pending,
      node: null
    };
    state.messages.push(msg);
    var wrap = document.createElement("div");
    wrap.className = "msg " + (msg.role === "user" ? "user" : "bot");
    var who = document.createElement("div");
    who.className = "who";
    var bubble = document.createElement("div");
    bubble.className = "bubble";
    wrap.append(who, bubble);
    msg.node = wrap;
    var log = $("log");
    var empty = log.querySelector(".empty");
    if (empty) empty.remove();
    log.append(wrap);
    paintMessage(msg);
    scrollLog(true);
    return msg;
  }
  function updateMessage(msg, patch) {
    Object.keys(patch).forEach(function (key) { msg[key] = patch[key]; });
    var log = $("log");
    log.dataset.stick = nearBottom(log) ? "1" : "0";
    paintMessage(msg);
    scrollLog(false);
    if (!msg.pending) saveThread();
  }
  function showEmpty() {
    var log = $("log");
    log.replaceChildren();
    var empty = document.createElement("div");
    empty.className = "empty";
    var icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.innerHTML = ICONS.chat;
    var text = document.createElement("div");
    var mode = currentAgent().mode;
    var project = currentProject();
    text.textContent = !project
      ? "先在工作台选择或创建一个项目。"
      : mode === "ledger"
        ? "问项目「" + project.name + "」还剩多少、花了多少、输入输出和缓存 token。数字只来自网关记录。"
        : mode === "docs"
          ? "上传资料后提问。回答会注明文件名；资料里没有的，会说不知道。"
          : mode === "vision"
            ? "上传或粘贴一张图片，再写下问题。"
            : "输入问题后发送。回复来自网关，并记在当前项目上。";
    empty.append(icon, text);
    log.append(empty);
  }
  async function resetChat() {
    if (state.abort) state.abort.abort();
    state.sending = false;
    state.messages = [];
    state.attachment = null;
    showEmpty();
    renderComposer();
    await clearStoredThread();
  }

  function showTab(id, fromHash) {
    if (!TABS[id]) id = "home";
    state.tab = id;
    Object.keys(TABS).forEach(function (key) {
      $("panel-" + key).classList.toggle("active", key === id);
    });
    document.querySelectorAll("#nav button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === id);
    });
    var crumb = TABS[id];
    if (id === "chat") crumb = currentAgent().title;
    $("crumb").textContent = crumb;
    $("content").classList.toggle("chat-mode", id === "chat");
    if (!fromHash && location.hash !== "#" + id) {
      ignoreHash = true;
      location.hash = id;
    }
  }
  function ensureProject() {
    if (currentProject()) return true;
    setComposerError(state.projects.length ? "请先选择一个项目。" : "请先创建一个项目。");
    showTab("home");
    return false;
  }
  async function openAgent(key) {
    if (!ensureProject()) return;
    var next = key === "ledger" ? LEDGER : AGENTS.filter(function (agent) { return agent.key === key; })[0];
    if (!next) return;
    if (state.agentKey !== key) {
      await saveThread();
      state.agentKey = key;
      state.attachment = null;
      state.audioFile = null;
      var picked = L.pickModel(state.models, key === "docs" ? "qa" : key);
      if (picked) state.modelId = picked.id;
      await loadThread();
    }
    renderModels();
    renderComposer();
    renderDocs();
    showTab("chat");
  }

  async function refreshConnection() {
    if (!state.projectId) {
      state.connected = false;
      state.models = [];
      renderStatus();
      return;
    }
    state.loading = true;
    renderStatus();
    try {
      var res = await apiFetch(projectPath("/v1/models"), { timeout: 20000 });
      if (!res.ok) {
        var failed = await readPayload(res);
        state.connected = false;
        state.connError = failed.message || "没有读到模型列表。";
        state.models = [];
        return;
      }
      state.models = L.parseModelsPayload(await res.json());
      state.connected = true;
      state.connError = "";
      if (!currentModel()) {
        var picked = L.pickModel(state.models, state.agentKey === "docs" ? "qa" : state.agentKey);
        state.modelId = picked ? picked.id : (state.models[0] ? state.models[0].id : "");
      }
      refreshUsage();
    } catch (err) {
      if (err && err.network === "session") return;
      state.connected = false;
      state.connError = joinExplain(explainThrown(err));
    } finally {
      state.loading = false;
      renderStatus();
      renderMetrics();
      renderAgents();
      renderModels();
      renderComposer();
      renderUser();
    }
  }
  async function refreshUsage() {
    if (!state.projectId) return;
    try {
      var res = await apiFetch(projectPath("/ledger"), { timeout: 20000 });
      if (!res.ok) return;
      var data = await res.json();
      state.usage = data.quota || null;
      renderMetrics();
    } catch (e) {}
  }
  async function loadDocs() {
    state.docs = [];
    if (!state.projectId) { renderDocs(); renderMetrics(); return; }
    try {
      var res = await apiFetch(projectPath("/docs"));
      if (!res.ok) return;
      var data = await res.json();
      state.docs = data.documents || [];
    } catch (e) {}
    renderDocs();
    renderMetrics();
  }
  async function loadProjects() {
    var res = await apiFetch("/api/rg/projects");
    if (!res.ok) return;
    var data = await res.json();
    state.projects = data.projects || [];
  }
  function rememberProject() {
    if (state.username && state.projectId) storeSet("gw.project." + state.username, state.projectId);
  }
  function chooseInitialProject() {
    var saved = storeGet("gw.project." + state.username);
    var found = state.projects.filter(function (project) { return project.id === saved; })[0];
    if (found) state.projectId = found.id;
    else if (state.projects.length === 1) state.projectId = state.projects[0].id;
    else state.projectId = "";
    rememberProject();
  }
  async function selectProject(id) {
    state.projectId = id;
    rememberProject();
    state.usage = null;
    state.models = [];
    renderProjects();
    renderUser();
    await refreshConnection();
    await loadDocs();
    await loadThread();
  }
  async function createProject(name) {
    var res = await apiFetch("/api/rg/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name })
    });
    var payload = await readPayload(res);
    if (!res.ok) throw new Error(payload.message || "没有创建成功。");
    await loadProjects();
    var created = payload.json.project;
    if (created && (state.projects.length === 1 || !state.projectId)) await selectProject(created.id);
    else renderProjects();
  }

  function enterApp() {
    document.body.classList.add("authed");
    $("login").hidden = true;
    $("app").hidden = false;
    renderUser();
    renderProjects();
    renderStatus();
    renderMetrics();
    renderAgents();
    renderModels();
    renderComposer();
    renderDocs();
    renderFooter();
    if (!state.messages.length) showEmpty();
    showTab("home", true);
  }
  function forceLogout(message) {
    if (state.abort) state.abort.abort();
    state.username = "";
    state.projects = [];
    state.projectId = "";
    state.docs = [];
    state.models = [];
    state.usage = null;
    state.connected = false;
    state.messages = [];
    state.attachment = null;
    state.audioFile = null;
    $("passwordInput").value = "";
    $("app").hidden = true;
    $("login").hidden = false;
    document.body.classList.remove("authed");
    if ($("settings").open) $("settings").close();
    showLoginError(message || "");
    setLoginBusy(false);
  }

  function historyMessages() {
    var out = [];
    state.messages.forEach(function (msg) {
      if (msg.pending || msg.error || !msg.apiText) return;
      out.push({ role: msg.role === "user" ? "user" : "assistant", content: msg.role === "user" ? msg.apiText : msg.text });
    });
    return out.slice(-12);
  }
  function userContent(text, image) {
    if (!image) return text;
    return [
      { type: "text", text: text },
      { type: "image_url", image_url: { url: image.dataUrl } }
    ];
  }
  function applySsePayload(payload, bot, acc) {
    var delta = L.sseDelta(payload);
    if (delta.done || delta.ignore) return;
    if (delta.error) { acc.failed = delta.error; return; }
    acc.content += delta.content || "";
    acc.reasoning += delta.reasoning || "";
    updateMessage(bot, { text: acc.content || acc.reasoning, pending: true });
  }
  async function readChatResponse(res, bot) {
    var type = (res.headers.get("content-type") || "").toLowerCase();
    var raw = "";
    if (type.indexOf("text/event-stream") === -1 || !res.body || !res.body.getReader) {
      raw = await res.text();
      if (raw.trim().indexOf("data:") === 0) {
        var buffered = { content: "", reasoning: "", failed: "" };
        var bufferedParser = L.createSseParser(function (payload) { applySsePayload(payload, bot, buffered); });
        bufferedParser.push(raw);
        bufferedParser.flush();
        if (buffered.failed) throw Object.assign(new Error("api"), { apiMessage: buffered.failed });
        updateMessage(bot, { text: (buffered.content || buffered.reasoning).trim() || "模型没有返回文字。", pending: false });
        return;
      }
      var data;
      try { data = JSON.parse(raw); } catch (e) { throw Object.assign(new Error("api"), { apiMessage: "模型返回了无法识别的内容。" }); }
      if (data && data.error) throw Object.assign(new Error("api"), { apiMessage: data.error.message || "" });
      updateMessage(bot, { text: L.extractAssistantText(data).trim() || "模型没有返回文字。", pending: false });
      return;
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var acc = { content: "", reasoning: "", failed: "" };
    var parser = L.createSseParser(function (payload) { applySsePayload(payload, bot, acc); });
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
      if (acc.failed) break;
    }
    parser.flush();
    if (acc.failed) throw Object.assign(new Error("api"), { apiMessage: acc.failed });
    updateMessage(bot, { text: (acc.content || acc.reasoning).trim() || "模型没有返回文字。", pending: false });
  }
  async function sendChat(model, agent, text, image) {
    var prior = historyMessages();
    var display = text || (image ? "（仅图片）" : "");
    pushMessage({ role: "user", who: "你", text: display, apiText: text || "请结合图片回答。", imageUrl: image ? image.dataUrl : "" });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var messages = [];
    if (agent.system) messages.push({ role: "system", content: agent.system });
    prior.forEach(function (item) { messages.push(item); });
    messages.push({ role: "user", content: userContent(text || "请结合图片回答。", image) });
    var res = await apiFetch(projectPath("/v1/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.id, stream: true, messages: messages }),
      signal: state.abort ? state.abort.signal : undefined,
      timeout: 180000
    });
    state.calls += 1;
    if (!res.ok) {
      var failed = await readPayload(res);
      var explained = L.explainHttpError({ status: res.status, raw: failed.raw, context: "text" });
      updateMessage(bot, { text: joinExplain(explained), error: true, pending: false, who: "网关" });
      return;
    }
    await readChatResponse(res, bot);
  }
  async function sendDocs(text) {
    pushMessage({ role: "user", who: "你", text: text, apiText: text });
    var bot = pushMessage({ role: "bot", who: "项目问答", text: "", pending: true });
    var model = currentModel();
    var res = await apiFetch(projectPath("/qa"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, model: model ? model.id : "" }),
      timeout: 120000
    });
    var payload = await readPayload(res);
    if (!res.ok) {
      updateMessage(bot, { text: payload.message || "项目问答没有完成。", error: true, pending: false, who: "项目问答" });
      return;
    }
    updateMessage(bot, {
      text: payload.json.text || "根据当前项目资料，我不知道。",
      citations: payload.json.citations || [],
      pending: false,
      who: "项目问答"
    });
  }
  async function sendImage(model, prompt) {
    pushMessage({ role: "user", who: "你", text: prompt, apiText: prompt });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var res = await apiFetch(projectPath("/v1/images/generations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.id, prompt: prompt, n: 1, size: "1024x1024" }),
      signal: state.abort ? state.abort.signal : undefined,
      timeout: 180000
    });
    state.calls += 1;
    if (!res.ok) {
      var failed = await readPayload(res);
      updateMessage(bot, { text: joinExplain(L.explainHttpError({ status: res.status, raw: failed.raw, context: "image" })), error: true, pending: false, who: "网关" });
      return;
    }
    var image = L.extractImageResult(await res.json());
    if (!image) {
      updateMessage(bot, { text: "生图接口有响应，但没有返回可显示的图片。", error: true, pending: false, who: "网关" });
      return;
    }
    updateMessage(bot, { text: "已按描述生成图片。", imageUrl: image.src, pending: false });
  }
  async function sendAudio(model) {
    var file = state.audioFile;
    pushMessage({ role: "user", who: "你", text: "转写录音：" + (file.name || "音频"), apiText: "" });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var body = new FormData();
    body.append("file", file, file.name || "audio.webm");
    body.append("model", model.id);
    var res = await apiFetch(projectPath("/v1/audio/transcriptions"), {
      method: "POST",
      body: body,
      signal: state.abort ? state.abort.signal : undefined,
      timeout: 180000
    });
    state.calls += 1;
    if (!res.ok) {
      var failed = await readPayload(res);
      updateMessage(bot, { text: joinExplain(L.explainHttpError({ status: res.status, raw: failed.raw, context: "audio" })), error: true, pending: false, who: "网关" });
      return;
    }
    var text = L.extractTranscript(await res.json()).trim();
    updateMessage(bot, { text: text || "转写接口没有返回文字。", error: !text, pending: false });
  }
  async function sendLedger(text) {
    pushMessage({ role: "user", who: "你", text: text, apiText: text });
    var bot = pushMessage({ role: "bot", who: "澄账", text: "", pending: true });
    var res = await apiFetch(projectPath("/ledger"), { timeout: 20000 });
    var payload = await readPayload(res);
    if (!res.ok) {
      updateMessage(bot, { text: payload.message || "没有读到这个项目的用量。", error: true, pending: false });
      return;
    }
    var answer = L.answerLedger(text, payload.json, new Date());
    updateMessage(bot, { text: answer.text, error: !!answer.error, pending: false, who: "澄账" });
  }

  function failPending(err) {
    var pending = state.messages[state.messages.length - 1];
    var text = joinExplain(explainThrown(err));
    if (pending && pending.pending) updateMessage(pending, { text: text, error: true, pending: false, who: "网关" });
    else setComposerError(text);
  }

  async function send() {
    if (state.sending) return;
    setComposerError("");
    if (!ensureProject()) return;
    var agent = currentAgent();
    var model = currentModel();
    if (agent.mode === "ledger") {
      var ledgerText = $("prompt").value.trim();
      if (!ledgerText) { setComposerError("请输入要问的用量问题。"); return; }
      state.sending = true;
      renderComposer();
      $("prompt").value = "";
      try { await sendLedger(ledgerText); }
      catch (err) { failPending(err); }
      finally { state.sending = false; renderComposer(); }
      return;
    }
    var text = $("prompt").value.trim();
    if (agent.mode === "docs") {
      if (!text) { setComposerError("请输入要问的问题。"); return; }
      state.sending = true;
      renderComposer();
      $("prompt").value = "";
      try { await sendDocs(text); }
      catch (err) { failPending(err); }
      finally { state.sending = false; renderComposer(); }
      return;
    }
    if (!model) { setComposerError("请先选择一个模型。"); return; }
    if (agent.mode === "audio") {
      if (!state.audioFile) { setComposerError("请先选择一段录音。"); return; }
      if (!audioReady() && model.kinds.indexOf("audio") === -1) { setComposerError("语音转写尚未接入。"); return; }
    } else if (agent.mode === "vision") {
      if (!text && !state.attachment) { setComposerError("请输入问题，或附上一张图片。"); return; }
    } else if (!text) {
      setComposerError(agent.mode === "image" ? "请先描述要生成的画面。" : "请输入要发送的内容。");
      return;
    }
    state.sending = true;
    renderComposer();
    var ctrl = new AbortController();
    state.abort = ctrl;
    try {
      if (agent.mode === "audio") await sendAudio(model);
      else if (agent.mode === "image") { $("prompt").value = ""; await sendImage(model, text); }
      else {
        var image = state.attachment;
        state.attachment = null;
        $("prompt").value = "";
        renderAttachment();
        await sendChat(model, agent, text, agent.mode === "vision" ? image : null);
      }
    } catch (err) {
      var pending = state.messages[state.messages.length - 1];
      if (pending && pending.pending) updateMessage(pending, { text: joinExplain(explainThrown(err)), error: true, pending: false, who: "网关" });
      else setComposerError(joinExplain(explainThrown(err)));
    } finally {
      state.sending = false;
      state.abort = null;
      renderComposer();
      $("prompt").focus();
    }
  }

  function fileToImageDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) { reject(new Error("请选择图片文件。")); return; }
      if (file.size > 12 * 1024 * 1024) { reject(new Error("图片超过 12MB，请换一张小一些的。")); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("这张图片无法读取。")); };
      img.src = url;
    });
  }
  function drawSampleImage() {
    var canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#e8f0ff";
    ctx.fillRect(0, 0, 640, 400);
    ctx.fillStyle = "#f7f2ea";
    ctx.fillRect(150, 48, 340, 304);
    ctx.fillStyle = "#1f6f64";
    ctx.fillRect(150, 48, 340, 72);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("春山茶叶", 320, 94);
    ctx.fillStyle = "#2a3330";
    ctx.font = "22px sans-serif";
    ctx.fillText("明前龙井  125g", 320, 190);
    return canvas.toDataURL("image/png");
  }
  async function attachImageFile(file) {
    try {
      state.attachment = { dataUrl: await fileToImageDataUrl(file), name: file.name || "图片" };
      setComposerError("");
      renderAttachment();
    } catch (err) {
      setComposerError(err.message || "图片无法使用。");
    }
  }
  async function uploadDoc(file) {
    if (!ensureProject()) return;
    setDocError("");
    var body = new FormData();
    body.append("file", file, file.name || "资料.txt");
    try {
      var res = await apiFetch(projectPath("/docs"), { method: "POST", body: body, timeout: 60000 });
      var payload = await readPayload(res);
      if (!res.ok) { setDocError(payload.message || "没有上传成功。"); return; }
      await loadDocs();
    } catch (err) {
      setDocError(joinExplain(explainThrown(err)));
    }
  }

  function bind() {
    $("loginTheme").onclick = toggleTheme;
    $("themeBtn").onclick = toggleTheme;
    $("togglePassword").onclick = function () {
      var input = $("passwordInput");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      $("togglePassword").textContent = show ? "隐藏" : "显示";
    };
    $("loginForm").addEventListener("submit", onLogin);
    $("nav").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-tab]");
      if (button) showTab(button.dataset.tab);
    });
    document.addEventListener("click", function (event) {
      var project = event.target.closest("[data-project]");
      if (project && project.dataset.project) { selectProject(project.dataset.project); return; }
      var agent = event.target.closest("[data-agent]");
      if (agent) openAgent(agent.dataset.agent);
    });
    $("projectSwitch").onclick = function () {
      if (state.projects.length > 1 && state.projectId) {
        state.projectId = "";
        storeSet("gw.project." + state.username, "");
        state.models = [];
        state.connected = false;
        renderProjects();
        renderStatus();
        renderComposer();
      }
      showTab("home");
    };
    $("createProjectForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      var name = $("projectNameInput").value.trim();
      if (!name) { setProjectError("请填写项目名称。"); return; }
      $("createProjectBtn").disabled = true;
      try {
        await createProject(name);
        $("projectNameInput").value = "";
        setProjectError("");
      } catch (err) {
        setProjectError(err.message || "没有创建成功。");
      } finally {
        $("createProjectBtn").disabled = false;
      }
    });
    $("createReadyForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      var name = $("readyNameInput").value.trim();
      if (!name) return;
      try {
        await createProject(name);
        $("readyNameInput").value = "";
        setProjectError("");
      } catch (err) {
        setProjectError(err.message || "没有创建成功。");
      }
    });
    $("createAnotherForm").addEventListener("submit", async function (event) {
      event.preventDefault();
      var name = $("anotherNameInput").value.trim();
      if (!name) return;
      try {
        await createProject(name);
        $("anotherNameInput").value = "";
      } catch (err) {
        setProjectError(err.message || "没有创建成功。");
        $("projectError").hidden = false;
      }
    });
    $("userBtn").onclick = function () {
      $("setName").value = state.name || state.username;
      $("settingsError").hidden = true;
      $("settings").showModal();
    };
    $("ledgerFab").onclick = function () { openAgent("ledger"); };
    $("closeSettings").onclick = function () { $("settings").close(); };
    $("settingsForm").addEventListener("submit", function (event) {
      event.preventDefault();
      state.name = $("setName").value.trim().slice(0, 24) || state.username;
      var map = nameMap();
      map[state.username] = state.name;
      saveNameMap(map);
      $("settings").close();
      renderUser();
    });
    $("logoutBtn").onclick = async function () {
      $("settings").close();
      try { await fetch("/api/rg/logout", { method: "POST", credentials: "same-origin" }); } catch (e) {}
      forceLogout("");
    };
    $("exportChats").onclick = function () {
      exportChats().catch(function () {
        $("settingsError").hidden = false;
        $("settingsError").textContent = "这台浏览器暂时导不出对话。";
      });
    };
    $("retryBtn").onclick = refreshConnection;
    $("modelFilter").addEventListener("input", function () { state.filter = $("modelFilter").value; renderModels(); });
    $("modelList").addEventListener("click", function (event) {
      var button = event.target.closest("[data-id]");
      if (!button) return;
      state.modelId = button.dataset.id;
      renderModels();
      renderComposer();
    });
    $("chips").addEventListener("click", function (event) {
      var button = event.target.closest("[data-sample]");
      if (!button) return;
      $("prompt").value = button.dataset.sample;
      $("prompt").focus();
    });
    $("clearChat").onclick = resetChat;
    $("pickDoc").onclick = function () { $("docInput").click(); };
    $("docInput").onchange = function () {
      var file = $("docInput").files && $("docInput").files[0];
      $("docInput").value = "";
      if (file) uploadDoc(file);
    };
    $("docList").addEventListener("click", async function (event) {
      var button = event.target.closest("[data-doc]");
      if (!button || !state.projectId) return;
      await apiFetch(projectPath("/docs/" + encodeURIComponent(button.dataset.doc)), { method: "DELETE" });
      await loadDocs();
    });
    $("pickImage").onclick = function () { $("imageInput").click(); };
    $("imageInput").onchange = function () {
      var file = $("imageInput").files && $("imageInput").files[0];
      $("imageInput").value = "";
      if (file) attachImageFile(file);
    };
    $("sampleImage").onclick = function () {
      state.attachment = { dataUrl: drawSampleImage(), name: "示例包装图" };
      renderAttachment();
    };
    $("attachPreview").addEventListener("click", function (event) {
      if (event.target.id === "removeImage") { state.attachment = null; renderAttachment(); }
    });
    $("pickAudio").onclick = function () { $("audioInput").click(); };
    $("audioInput").onchange = function () {
      var file = $("audioInput").files && $("audioInput").files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { setComposerError("音频超过 25MB。"); return; }
      state.audioFile = file;
      $("audioState").textContent = "已选择：" + file.name;
    };
    $("prompt").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); send(); }
    });
    $("prompt").addEventListener("paste", function (event) {
      if (currentAgent().mode !== "vision" || !event.clipboardData) return;
      var items = event.clipboardData.items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var file = items[i].getAsFile();
          if (file) { event.preventDefault(); attachImageFile(file); }
          return;
        }
      }
    });
    $("sendBtn").onclick = send;
    $("stopBtn").onclick = function () { if (state.abort) state.abort.abort(); };
    $("log").addEventListener("scroll", function () {
      $("log").dataset.stick = nearBottom($("log")) ? "1" : "0";
    });
    window.addEventListener("hashchange", function () {
      if (ignoreHash) { ignoreHash = false; return; }
      if (!$("app").hidden) showTab((location.hash || "#home").replace("#", ""), true);
    });
  }

  async function onLogin(event) {
    event.preventDefault();
    var username = $("usernameInput").value.trim();
    var password = $("passwordInput").value;
    if (!username || !password) { showLoginError("请填写用户名和密码。"); return; }
    setLoginBusy(true);
    showLoginError("");
    try {
      var res = await fetch("/api/rg/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username, password: password })
      });
      var payload = await readPayload(res);
      if (!res.ok) {
        showLoginError(payload.message || "没有登录成功。");
        return;
      }
      $("passwordInput").value = "";
      state.username = payload.json.username || username;
      var saved = nameMap()[state.username];
      state.name = saved || payload.json.displayName || state.username;
      await loadProjects();
      chooseInitialProject();
      enterApp();
      if (state.projectId) {
        await refreshConnection();
        await loadDocs();
        await loadThread();
      }
    } catch (e) {
      showLoginError("网络异常，暂时连不上网关。请稍后再试。");
    } finally {
      setLoginBusy(false);
    }
  }

  async function boot() {
    L.purgeLegacySecrets(window.localStorage);
    ["privacyLogin", "privacyComposer", "privacySettings"].forEach(function (id) {
      if ($(id)) $(id).textContent = L.PRIVACY_NOTICE;
    });
    try {
      var res = await fetch("/api/rg/me", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return;
      var payload = await readPayload(res);
      state.username = payload.json.username || "";
      if (!state.username) return;
      state.name = nameMap()[state.username] || payload.json.displayName || state.username;
      await loadProjects();
      chooseInitialProject();
      enterApp();
      if (state.projectId) {
        await refreshConnection();
        await loadDocs();
        await loadThread();
      }
    } catch (e) {}
  }

  bind();
  applyTheme(document.documentElement.getAttribute("data-theme") || "light");
  boot();
})();
