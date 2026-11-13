(function () {
  var L = window.GatewayLogic;
  var ICONS = {
    blue: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10.5" r="1.2" fill="currentColor" stroke="none"/><path d="M9 14.5c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2"/></svg>',
    violet: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    teal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V7l8-3 8 3v12"/><path d="M8 10h8M8 14h8M8 18h8"/></svg>',
    orange: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m21 16-5-5-4 4-2-2-5 5"/></svg>',
    green: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><path d="M8 13a4 4 0 0 1 8 0"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/><path d="M12 14v5M9 19h6"/></svg>',
    slate: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12A10 10 0 1 1 12 2"/><path d="M22 6v6h-6"/><path d="M12 6v6l4 2"/></svg>',
    chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  };
  var AGENTS = [
    { key: "vision", mode: "vision", icon: "blue", pill: "推荐", title: "看图问答助手", desc: "解读截图、包装、文档和表格照片。", tags: ["识图"], samples: ["这张图里写了哪些文字？", "帮我总结这张截图的要点。"], system: "你是同事的看图助手。请用简洁中文回答。先依据图片里真正看得见的内容说明，再回答问题。图中没有的信息不要编造。如果没有收到图片，请直接说明需要一张图。" },
    { key: "qa", mode: "text", icon: "violet", pill: "推荐", title: "团队问答助手", desc: "回答产品、规则和内部说明，作为统一入口。", tags: ["对话"], samples: ["用三句话说明同事应该怎么使用这个网关。", "写一条渠道故障时可以发给同事的通知。"], system: "你是团队内部的问答助手。用准确、好读的中文回答。不确定就说明不确定，不要假装查过了内部系统。" },
    { key: "write", mode: "text", icon: "teal", pill: "推荐", title: "写作与纪要助手", desc: "改写、翻译，并把会议记录整理成待办。", tags: ["对话"], samples: ["把下面的会议记录整理成结论和待办：\n", "把这段话改得更适合发给客户：\n", "把下面的内容翻译成英文：\n"], system: "你是写作与会议纪要助手。需要整理纪要时，分成「结论」和「待办」。待办写清事项；原文里有负责人就保留。改写时保留原意。默认用中文，除非用户要求翻译。" },
    { key: "image", mode: "image", icon: "orange", pill: "额度控制", pillClass: "soon", title: "文生图助手", desc: "按描述出示意图、配图和海报草稿。", tags: ["生图"], samples: ["一只在茶馆里看书的橘猫，暖色灯光，国风插画", "浅色背景的产品架构示意图，扁平插画，留白充足"], system: "" },
    { key: "audio", mode: "audio", icon: "green", pill: "", title: "语音转写助手", desc: "把讨论录音转成文字。结果来自网关，不会在本地编造。", tags: ["语音"], samples: [], system: "" }
  ];
  var ADMIN_AGENTS = [
    { key: "inspect", admin: true, tab: "channels", icon: "slate", pill: "管理员", pillClass: "admin", title: "渠道巡检助手", desc: "查看这把令牌能调用哪些模型。不能修改渠道，也不能看到厂商密钥。", tags: ["运维"] },
    { key: "usage", admin: true, tab: "quota", icon: "slate", pill: "管理员", pillClass: "admin", title: "用量解读助手", desc: "用白话说明这把令牌用了多少额度。不会列出其他同事。", tags: ["成本"] }
  ];
  var TABS = { home: "工作台", agents: "智能体", chat: "对话", channels: "渠道", quota: "成员与额度" };

  var state = {
    token: "",
    base: "",
    name: "",
    admin: false,
    adminUrl: "",
    models: [],
    usage: null,
    connected: false,
    connError: "",
    loading: false,
    gatewayVersion: "",
    calls: 0,
    tab: "home",
    agentKey: "qa",
    modelId: "",
    filter: "",
    messages: [],
    attachment: null,
    audioFile: null,
    sending: false,
    abort: null
  };
  var ignoreHash = false;
  var copyTimer = 0;

  function $(id) { return document.getElementById(id); }
  function storeGet(key) { try { return localStorage.getItem(key) || ""; } catch (e) { return ""; } }
  function storeSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function storeRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function currentAgent() {
    return AGENTS.filter(function (agent) { return agent.key === state.agentKey; })[0] || AGENTS[1];
  }
  function currentModel() {
    for (var i = 0; i < state.models.length; i++) {
      if (state.models[i].id === state.modelId) return state.models[i];
    }
    return null;
  }
  function visibleModels() {
    var q = state.filter.trim().toLowerCase();
    var list = state.models.filter(function (model) {
      if (!q) return true;
      return (model.id + " " + model.displayName + " " + model.vendor).toLowerCase().indexOf(q) !== -1;
    });
    return list.slice().sort(function (a, b) {
      var diff = L.scoreModel(b, state.agentKey) - L.scoreModel(a, state.agentKey);
      return diff || a.id.localeCompare(b.id);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    var label = theme === "dark" ? "切换为浅色" : "切换为深色";
    $("themeLabel").textContent = label;
    $("loginTheme").textContent = theme === "dark" ? "浅色" : "深色";
    document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#12100e" : "#f3eee4");
    storeSet(L.THEME_KEY, theme === "dark" ? "dark" : "light");
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  }

  function showLoginError(text) {
    var box = $("loginError");
    box.hidden = !text;
    box.textContent = text || "";
  }
  function setLoginBusy(busy, label) {
    $("loginSubmit").disabled = busy;
    $("loginSubmit").textContent = busy ? (label || "正在验证…") : "进入工作台";
  }

  function apiFetch(path, options) {
    var opt = options || {};
    var headers = new Headers(opt.headers || {});
    if (state.token && !headers.has("Authorization")) headers.set("Authorization", "Bearer " + state.token);
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, opt.timeout || 120000);
    if (opt.signal) {
      if (opt.signal.aborted) ctrl.abort();
      else opt.signal.addEventListener("abort", function () { ctrl.abort(); }, { once: true });
    }
    var init = { method: opt.method || "GET", headers: headers, signal: ctrl.signal, cache: "no-store" };
    if (opt.body != null) init.body = opt.body;
    return fetch(L.apiUrl(state.base, path), init).catch(function (err) {
      var wrapped = new Error(timedOut ? "timeout" : (err && err.name === "AbortError" ? "abort" : "network"));
      wrapped.network = timedOut ? "timeout" : (err && err.name === "AbortError" ? "abort" : "network");
      throw wrapped;
    }).finally(function () { clearTimeout(timer); });
  }

  function readExplained(res, context) {
    return res.text().then(function (raw) {
      return L.explainHttpError({ status: res.status, raw: raw, context: context || "" });
    }, function () {
      return L.explainHttpError({ status: res.status, raw: "", context: context || "" });
    });
  }

  function explainThrown(err, context) {
    return L.explainHttpError({ status: 0, network: err && err.network ? err.network : "network", context: context || "" });
  }

  function joinExplain(explained) {
    return explained.detail ? explained.title + " " + explained.detail : explained.title;
  }

  function renderStatus() {
    var badge = $("statusBadge");
    var text = $("statusText");
    badge.classList.remove("ok", "bad");
    if (state.loading) {
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
    var name = state.name || (state.usage && state.usage.name) || "同事";
    var role = state.admin ? "管理员视图" : "同事";
    $("userLabel").textContent = name + " · " + role;
    $("avatar").textContent = name.slice(0, 1) || "同";
    $("navChannels").hidden = !state.admin;
    $("adminSection").hidden = !state.admin;
  }

  function renderMetrics() {
    var caps = L.capabilitySet(state.models);
    var vendors = [];
    state.models.forEach(function (model) {
      if (model.vendor && model.vendor !== "其他" && vendors.indexOf(model.vendor) === -1) vendors.push(model.vendor);
    });
    var quota = L.quotaSummary(state.usage);
    var quotaValue = "—";
    var quotaHint = "登录后读取这把令牌";
    if (state.usage && quota.known) {
      if (quota.unlimited) { quotaValue = "不限额"; quotaHint = "仍建议按人分开"; }
      else if (quota.percent == null) { quotaValue = "—"; quotaHint = "网关没有返回总额"; }
      else { quotaValue = quota.percent + "%"; quotaHint = "已用 " + L.formatCount(quota.used) + " / " + L.formatCount(quota.granted); }
    }
    var items = [
      ["可用模型", state.connected ? String(state.models.length) : "—", vendors.slice(0, 3).join(" / ") || "以令牌权限为准"],
      ["令牌已用", quotaValue, quotaHint],
      ["能力覆盖", state.connected ? (caps.count ? caps.count + " 类" : "0") : "—", caps.labels.length ? caps.labels.join(" · ") : "对话 · 识图 · 生图 · 语音"],
      ["本次调用", String(state.calls), "只统计这次打开页面后的真实请求"]
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

  function audioReady() {
    return state.models.some(function (model) { return model.kinds.indexOf("audio") !== -1; });
  }
  function imageReady() {
    return state.models.some(function (model) { return model.kinds.indexOf("image") !== -1; });
  }

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
    var tagList = agent.tags.slice();
    if (!agent.admin) {
      var picked = L.pickModel(state.models, agent.key);
      if (picked) tagList.push(picked.displayName === picked.id ? picked.id : picked.displayName);
    }
    tagList.forEach(function (tag) {
      var span = document.createElement("span");
      span.className = "tag";
      span.textContent = tag;
      tags.append(span);
    });
    button.append(top, title, desc, tags);
    return button;
  }

  function renderAgents() {
    $("homeAgents").replaceChildren.apply($("homeAgents"), AGENTS.slice(0, 3).map(renderAgentCard));
    $("teamAgents").replaceChildren.apply($("teamAgents"), AGENTS.map(renderAgentCard));
    $("adminAgents").replaceChildren.apply($("adminAgents"), ADMIN_AGENTS.map(renderAgentCard));
  }

  function renderModels() {
    var root = $("modelList");
    var models = visibleModels();
    root.replaceChildren();
    if (!state.models.length) {
      var empty = document.createElement("p");
      empty.className = "fine";
      empty.textContent = state.connected ? "这把令牌下面没有模型。请管理员检查渠道和令牌的模型限制。" : "还没有读到模型列表。";
      root.append(empty);
      return;
    }
    if (!models.length) {
      var none = document.createElement("p");
      none.className = "fine";
      none.textContent = "没有符合筛选的模型。";
      root.append(none);
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
    $("playKicker").textContent = agent.title;
    $("playTitle").textContent = model ? model.displayName : "未选择模型";
    $("playHint").textContent = agent.desc;
    var chips = $("chips");
    chips.replaceChildren();
    if (agent.samples.length) {
      var label = document.createElement("span");
      label.className = "fine";
      label.textContent = "示例";
      chips.append(label);
      agent.samples.forEach(function (sample) {
        var button = document.createElement("button");
        button.type = "button";
        button.dataset.sample = sample;
        button.textContent = sample.replace(/\s+/g, " ").slice(0, 22);
        chips.append(button);
      });
    }
    chips.hidden = !agent.samples.length;
    $("attachRow").hidden = agent.mode !== "vision";
    $("audioRow").hidden = agent.mode !== "audio";
    $("prompt").hidden = agent.mode === "audio";
    var note = $("modeNote");
    note.hidden = true;
    note.textContent = "";
    if (agent.mode === "audio" && state.connected && !audioReady()) {
      note.hidden = false;
      note.textContent = "模型列表里还没有识别到语音模型，转写尚未接入。融光不会编造文字。管理员接入语音渠道后，刷新即可使用。";
    } else if (agent.mode === "image" && state.connected && !imageReady()) {
      note.hidden = false;
      note.textContent = "模型列表里还没有识别到生图模型。仍可以试一次；如果网关未配置，会显示错误，不会展示假图片。";
    } else if (model && model.kinds.indexOf("embedding") !== -1 && agent.mode !== "image" && agent.mode !== "audio") {
      note.hidden = false;
      note.textContent = "这是向量模型，不能用来对话。请换一个对话或识图模型。";
    }
    var endpoint = agent.mode === "image" ? "/v1/images/generations" : (agent.mode === "audio" ? "/v1/audio/transcriptions" : "真实调用");
    $("modelMeta").textContent = model ? ((model.displayName === model.id ? model.id : model.id) + " · " + endpoint) : "未选择模型";
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
    var footer = $("footerNote");
    footer.replaceChildren();
    footer.append("融光是同事使用的入口，不是 New API 官方管理后台。厂商密钥只留在服务器上。渠道、令牌和额度由管理员在 ");
    var link = document.createElement("a");
    link.href = state.adminUrl || L.defaultAdminUrl(location);
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = "管理后台";
    footer.append(link);
    footer.append(" 配置。");
    if (state.gatewayVersion) footer.append(" 当前网关 " + state.gatewayVersion + "。");
    var url = L.openaiBaseUrl(state.base, location.origin);
    $("gatewayUrl").textContent = url || "请先在设置里填写网关地址";
  }

  function renderChannels() {
    var root = $("channelCards");
    root.replaceChildren();
    if (!state.models.length) {
      var empty = document.createElement("p");
      empty.className = "fine";
      empty.textContent = "还没有可展示的模型。";
      root.append(empty);
      return;
    }
    var groups = {};
    var order = [];
    state.models.forEach(function (model) {
      if (!groups[model.vendor]) { groups[model.vendor] = []; order.push(model.vendor); }
      groups[model.vendor].push(model);
    });
    order.forEach(function (vendor) {
      var models = groups[vendor];
      var card = document.createElement("div");
      card.className = "ch";
      var head = document.createElement("div");
      head.className = "ch-head";
      var title = document.createElement("h3");
      title.textContent = vendor;
      var pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "令牌可调用";
      head.append(title, pill);
      var desc = document.createElement("p");
      desc.textContent = models.length + " 个模型。这里没有做付费探测，所以不显示延迟。";
      var tags = document.createElement("div");
      tags.className = "tags";
      var shown = models.slice(0, 8);
      shown.forEach(function (model) {
        var span = document.createElement("span");
        span.className = "tag";
        span.textContent = model.id;
        tags.append(span);
      });
      if (models.length > shown.length) {
        var more = document.createElement("span");
        more.className = "tag";
        more.textContent = "等 " + models.length + " 个";
        tags.append(more);
      }
      card.append(head, desc, tags);
      root.append(card);
    });
  }

  function renderQuota() {
    var summary = L.quotaSummary(state.usage);
    var caps = L.capabilitySet(state.models);
    var cards = $("quotaCards");
    cards.replaceChildren();
    var left = document.createElement("div");
    left.className = "card";
    var leftLabel = document.createElement("span");
    leftLabel.className = "fine";
    leftLabel.textContent = "用量解读";
    var leftStat = document.createElement("div");
    leftStat.className = "stat";
    var leftStrong = document.createElement("strong");
    var leftBody = document.createElement("div");
    if (!state.usage || !summary.known) {
      leftStrong.textContent = "还没有读到这把令牌的额度";
      leftBody.textContent = summary.advice;
    } else if (summary.unlimited) {
      leftStrong.textContent = (summary.name || "当前令牌") + " 不限额";
      leftBody.textContent = summary.advice;
    } else if (summary.percent == null) {
      leftStrong.textContent = (summary.name || "当前令牌") + " 已用 " + L.formatCount(summary.used);
      leftBody.textContent = summary.advice;
    } else {
      leftStrong.textContent = (summary.name || "当前令牌") + " 已用 " + summary.percent + "%";
      leftBody.textContent = summary.advice;
    }
    leftStat.append(leftStrong, leftBody);
    left.append(leftLabel, leftStat);

    var right = document.createElement("div");
    right.className = "card";
    var rightLabel = document.createElement("span");
    rightLabel.className = "fine";
    rightLabel.textContent = "这把令牌";
    var rightStat = document.createElement("div");
    rightStat.className = "stat";
    var rightStrong = document.createElement("strong");
    var rightBody = document.createElement("div");
    if (summary.known && !summary.unlimited && summary.percent != null) {
      rightStrong.textContent = "剩余 " + L.formatCount(summary.available);
      rightBody.textContent = "总额 " + L.formatCount(summary.granted) + "。额度点的换算以管理后台为准。";
    } else if (summary.known && summary.unlimited) {
      rightStrong.textContent = "没有额度上限";
      rightBody.textContent = "调用次数仍会记在 New API 的日志里。";
    } else {
      rightStrong.textContent = state.connected ? "额度接口没有返回" : "尚未连接";
      rightBody.textContent = "老版本网关可能没有这个接口。不影响对话，额度请到管理后台查看。";
    }
    if (summary.expiresAt) rightBody.textContent += " 到期：" + new Date(summary.expiresAt * 1000).toLocaleString("zh-CN") + "。";
    if (summary.limitsOn) rightBody.textContent += " 模型限制：" + (summary.limits.length ? summary.limits.slice(0, 6).join("、") : "已开启") + "。";
    rightStat.append(rightStrong, rightBody);
    right.append(rightLabel, rightStat);
    cards.append(left, right);

    var body = $("quotaTable");
    body.replaceChildren();
    var row = document.createElement("tr");
    function cell(text, pad) {
      var td = document.createElement("td");
      if (pad) td.className = "pad";
      td.textContent = text;
      return td;
    }
    var nameCell = cell(summary.known && summary.name ? summary.name : "当前令牌", true);
    var tokenCell = document.createElement("td");
    var code = document.createElement("code");
    code.textContent = state.token ? L.maskToken(state.token) : "—";
    tokenCell.append(code);
    var ability = cell(caps.labels.length ? caps.labels.join(" / ") : "—");
    var used = document.createElement("td");
    if (summary.known && summary.unlimited) used.textContent = "不限额";
    else if (summary.known && summary.percent != null) {
      var bar = document.createElement("span");
      bar.className = "bar";
      var fill = document.createElement("span");
      fill.style.width = summary.percent + "%";
      bar.append(fill);
      used.append(bar, document.createTextNode(summary.percent + "%"));
    } else used.textContent = "—";
    row.append(nameCell, tokenCell, ability, used);
    body.append(row);
  }

  function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  }
  function scrollLog(force) {
    var log = $("log");
    if (force || log.dataset.stick === "1") log.scrollTop = log.scrollHeight;
  }

  function fillBubble(bubble, text) {
    bubble.replaceChildren();
    var parts = String(text || "").split("```");
    parts.forEach(function (part, index) {
      if (index % 2 === 1) {
        var pre = document.createElement("pre");
        var code = document.createElement("code");
        code.textContent = part.replace(/^[a-zA-Z0-9_-]+\n/, "");
        pre.append(code);
        bubble.append(pre);
        return;
      }
      var lines = part.split("\n");
      lines.forEach(function (line, lineIndex) {
        if (lineIndex) bubble.append(document.createElement("br"));
        appendInline(bubble, line);
      });
    });
  }
  function appendInline(parent, text) {
    var re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    var last = 0;
    var match;
    while ((match = re.exec(text))) {
      if (match.index > last) parent.append(document.createTextNode(text.slice(last, match.index)));
      if (match[2]) {
        var strong = document.createElement("strong");
        strong.textContent = match[2];
        parent.append(strong);
      } else if (match[3]) {
        var code = document.createElement("code");
        code.textContent = match[3];
        parent.append(code);
      } else if (match[4] && match[5]) {
        var link = document.createElement("a");
        link.textContent = match[4];
        link.href = match[5];
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        parent.append(link);
      }
      last = match.index + match[0].length;
    }
    if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
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
    if (msg.imageUrl && L.safeImageSrc(msg.imageUrl)) {
      var box = document.createElement("div");
      box.className = "preview";
      var img = document.createElement("img");
      img.alt = msg.role === "user" ? "发送的图片" : "生成的图片";
      img.src = L.safeImageSrc(msg.imageUrl);
      box.append(img);
      bubble.append(box);
    }
    var who = msg.node.querySelector(".who");
    who.textContent = msg.who || "";
  }

  function pushMessage(partial) {
    var msg = {
      role: partial.role,
      who: partial.who || "",
      text: partial.text || "",
      apiText: partial.apiText || partial.text || "",
      imageUrl: partial.imageUrl || "",
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
    text.textContent = mode === "vision"
      ? "上传或粘贴一张图片，再写下问题。图片会发给网关里的视觉模型。"
      : mode === "image"
        ? "描述想要的画面，然后生成。如果模型还没接入，这里会显示网关返回的原因。"
        : mode === "audio"
          ? "选择一段录音后转写。没有语音模型时不会编造文字。"
          : "输入问题后发送。回复来自网关，不是本地模拟。";
    empty.append(icon, text);
    log.append(empty);
  }

  function resetChat() {
    if (state.abort) state.abort.abort();
    state.sending = false;
    state.messages = [];
    state.attachment = null;
    showEmpty();
    renderComposer();
  }

  function historyMessages() {
    var out = [];
    state.messages.forEach(function (msg) {
      if (msg.pending || msg.error || !msg.apiText) return;
      if (msg.role === "user") out.push({ role: "user", content: msg.apiText });
      else out.push({ role: "assistant", content: msg.text });
    });
    return out.slice(-12);
  }

  function setComposerError(text) {
    var box = $("composerError");
    box.hidden = !text;
    box.textContent = text || "";
  }

  async function refreshUsage() {
    var paths = ["/api/usage/token/", "/api/usage/token"];
    for (var i = 0; i < paths.length; i++) {
      try {
        var res = await apiFetch(paths[i], { timeout: 20000 });
        if (res.status === 404 || res.status === 405) continue;
        if (!res.ok) return;
        var json = await res.json();
        var usage = L.parseUsagePayload(json);
        if (!usage) return;
        state.usage = usage;
        renderMetrics();
        renderQuota();
        renderUser();
        return;
      } catch (e) {
        return;
      }
    }
  }

  async function refreshConnection() {
    state.loading = true;
    renderStatus();
    try {
      var res = await apiFetch("/v1/models", { timeout: 20000 });
      state.gatewayVersion = res.headers.get("x-new-api-version") || state.gatewayVersion;
      if (res.status === 401) {
        var denied = await readExplained(res, "");
        forceLogout(joinExplain(denied));
        return;
      }
      if (!res.ok) {
        var failed = await readExplained(res, "");
        state.connected = false;
        state.connError = joinExplain(failed);
        state.models = [];
        return;
      }
      var json = await res.json();
      state.models = L.parseModelsPayload(json);
      state.connected = true;
      state.connError = "";
      if (!currentModel()) {
        var picked = L.pickModel(state.models, state.agentKey);
        state.modelId = picked ? picked.id : (state.models[0] ? state.models[0].id : "");
      }
      refreshUsage();
    } catch (err) {
      state.connected = false;
      state.connError = err && err.network ? joinExplain(explainThrown(err)) : "网关返回了无法识别的内容。";
    } finally {
      state.loading = false;
      renderStatus();
      renderMetrics();
      renderAgents();
      renderModels();
      renderComposer();
      renderChannels();
      renderQuota();
      renderFooter();
      renderUser();
    }
  }

  function enterApp() {
    document.body.classList.add("authed");
    $("login").hidden = true;
    $("app").hidden = false;
    renderUser();
    renderStatus();
    renderMetrics();
    renderAgents();
    renderModels();
    renderComposer();
    renderChannels();
    renderQuota();
    renderFooter();
    if (!state.messages.length) showEmpty();
    var initial = (location.hash || "#home").replace("#", "");
    showTab(TABS[initial] ? initial : "home", true);
  }

  function forceLogout(message) {
    if (state.abort) state.abort.abort();
    state.token = "";
    state.models = [];
    state.usage = null;
    state.connected = false;
    state.messages = [];
    state.attachment = null;
    state.audioFile = null;
    storeRemove(L.TOKEN_KEY);
    $("tokenInput").value = "";
    $("app").hidden = true;
    $("login").hidden = false;
    document.body.classList.remove("authed");
    showLoginError(message || "");
    setLoginBusy(false);
  }

  function showTab(id, fromHash) {
    var requested = id;
    if (!TABS[id] || (id === "channels" && !state.admin)) id = "home";
    state.tab = id;
    Object.keys(TABS).forEach(function (key) {
      $("panel-" + key).classList.toggle("active", key === id);
    });
    document.querySelectorAll("#nav button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.tab === id);
    });
    $("crumb").textContent = TABS[id];
    $("content").classList.toggle("chat-mode", id === "chat");
    if ((!fromHash || requested !== id) && location.hash !== "#" + id) {
      ignoreHash = true;
      location.hash = id;
    }
  }

  function openAgent(key) {
    var admin = ADMIN_AGENTS.filter(function (agent) { return agent.key === key; })[0];
    if (admin) {
      if (!state.admin) return;
      showTab(admin.tab);
      return;
    }
    var agent = AGENTS.filter(function (item) { return item.key === key; })[0];
    if (!agent) return;
    if (state.agentKey !== key) {
      state.agentKey = key;
      resetChat();
    }
    var picked = L.pickModel(state.models, key);
    if (picked) state.modelId = picked.id;
    renderModels();
    renderComposer();
    showTab("chat");
  }

  function fileToImageDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        reject(new Error("请选择图片文件。"));
        return;
      }
      if (file.size > 12 * 1024 * 1024) {
        reject(new Error("图片超过 12MB，请换一张小一些的。"));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var width = img.width;
        var height = img.height;
        var scale = Math.min(1, 1600 / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("这张图片无法读取。"));
      };
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
    roundRect(ctx, 150, 48, 340, 304, 18);
    ctx.fillStyle = "#f7f2ea";
    ctx.fill();
    ctx.fillStyle = "#1f6f64";
    ctx.fillRect(150, 48, 340, 72);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("春山茶叶", 320, 94);
    ctx.fillStyle = "#2a3330";
    ctx.font = "22px sans-serif";
    ctx.fillText("明前龙井  125g", 320, 190);
    ctx.fillStyle = "#5b6662";
    ctx.font = "18px sans-serif";
    ctx.fillText("产地：杭州西湖", 320, 232);
    ctx.fillText("保质期：18 个月", 320, 268);
    return canvas.toDataURL("image/png");
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function attachImageFile(file) {
    try {
      var dataUrl = await fileToImageDataUrl(file);
      state.attachment = { dataUrl: dataUrl, name: file.name || "图片" };
      setComposerError("");
      renderAttachment();
    } catch (err) {
      setComposerError(err.message || "图片无法使用。");
    }
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
    if (type.indexOf("text/event-stream") === -1 || !res.body || !res.body.getReader) {
      var raw = await res.text();
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
      try { data = JSON.parse(raw); } catch (e) {
        throw Object.assign(new Error("api"), { apiMessage: "模型返回了无法识别的内容。" });
      }
      if (data && data.error) throw Object.assign(new Error("api"), { apiMessage: data.error.message || "" });
      var text = L.extractAssistantText(data).trim();
      updateMessage(bot, { text: text || "模型没有返回文字。", pending: false });
      return;
    }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var acc = { content: "", reasoning: "", failed: "" };
    var parser = L.createSseParser(function (payload) { applySsePayload(payload, bot, acc); });
    try {
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        parser.push(decoder.decode(chunk.value, { stream: true }));
        if (acc.failed) break;
      }
    } catch (err) {
      if (err && err.name === "AbortError") {
        var aborted = new Error("abort");
        aborted.network = "abort";
        aborted.partial = acc.content || acc.reasoning;
        throw aborted;
      }
      throw err;
    }
    parser.flush();
    if (acc.failed) throw Object.assign(new Error("api"), { apiMessage: acc.failed });
    updateMessage(bot, { text: (acc.content || acc.reasoning).trim() || "模型没有返回文字。", pending: false });
  }

  function lastImageUrl() {
    for (var i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "user" && state.messages[i].imageUrl && L.safeImageSrc(state.messages[i].imageUrl)) {
        return state.messages[i].imageUrl;
      }
    }
    return "";
  }
  async function sendChat(model, agent, text, image) {
    var prior = historyMessages();
    var replay = image;
    if (!replay && agent.mode === "vision") {
      var previous = lastImageUrl();
      if (previous) replay = { dataUrl: previous };
    }
    var display = text || (image ? "（仅图片）" : "（继续看上一张图）");
    var apiText = text || "请结合图片回答。";
    pushMessage({ role: "user", who: "你", text: display, apiText: apiText, imageUrl: image ? image.dataUrl : "" });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var messages = [{ role: "system", content: agent.system }];
    prior.forEach(function (item) { messages.push(item); });
    messages.push({ role: "user", content: userContent(apiText, replay) });
    var ctrl = new AbortController();
    state.abort = ctrl;
    var res = await apiFetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.id, stream: true, messages: messages }),
      signal: ctrl.signal,
      timeout: 180000
    });
    state.calls += 1;
    renderMetrics();
    if (!res.ok) {
      var explained = await readExplained(res, "text");
      updateMessage(bot, { text: joinExplain(explained), error: true, pending: false, who: "网关" });
      return;
    }
    try {
      await readChatResponse(res, bot);
    } catch (err) {
      if (err && err.network === "abort") throw err;
      if (err && err.network) {
        updateMessage(bot, { text: joinExplain(explainThrown(err)), error: true, pending: false, who: "网关" });
        return;
      }
      var message = err && err.apiMessage ? L.redact(err.apiMessage) : "模型返回了无法识别的内容。";
      updateMessage(bot, { text: message, error: true, pending: false, who: "网关" });
    }
  }

  async function sendImage(model, prompt) {
    pushMessage({ role: "user", who: "你", text: prompt, apiText: prompt });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var bodies = [
      { model: model.id, prompt: prompt, n: 1, size: "1024x1024" },
      { model: model.id, prompt: prompt, n: 1 }
    ];
    var last = null;
    for (var i = 0; i < bodies.length; i++) {
      var res = await apiFetch("/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodies[i]),
        signal: state.abort ? state.abort.signal : undefined,
        timeout: 180000
      });
      state.calls += 1;
      renderMetrics();
      if (res.ok) {
        var data = await res.json();
        var image = L.extractImageResult(data);
        if (image) {
          updateMessage(bot, { text: "已按描述生成图片。", imageUrl: image.src, pending: false });
          return;
        }
        updateMessage(bot, { text: "生图接口有响应，但没有返回可显示的图片。", error: true, pending: false, who: "网关" });
        return;
      }
      last = { status: res.status, explained: await readExplained(res, "image") };
      var rawHint = last.explained.detail || "";
      if (!(res.status === 400 && /size|尺寸/i.test(rawHint))) break;
    }
    if (last && L.shouldFallbackImage(last.status)) {
      try {
        var chat = await apiFetch("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: model.id, stream: false, messages: [{ role: "user", content: prompt }] }),
          signal: state.abort ? state.abort.signal : undefined,
          timeout: 180000
        });
        state.calls += 1;
        renderMetrics();
        if (chat.ok) {
          var chatData = await chat.json();
          var chatText = L.extractAssistantText(chatData);
          var urlMatch = chatText.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|webp|gif)/i);
          var dataMatch = chatText.match(/data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+/);
          var src = dataMatch ? L.safeImageSrc(dataMatch[0]) : (urlMatch ? L.safeImageSrc(urlMatch[0]) : "");
          if (src) {
            updateMessage(bot, { text: "图像接口未直接返回图片，已改从对话结果里取出图片。", imageUrl: src, pending: false });
            return;
          }
        }
      } catch (e) {}
    }
    updateMessage(bot, {
      text: last ? joinExplain(last.explained) : "生图没有成功。",
      error: true,
      pending: false,
      who: "网关"
    });
  }

  async function sendAudio(model) {
    var file = state.audioFile;
    pushMessage({ role: "user", who: "你", text: "转写录音：" + (file.name || "音频"), apiText: "" });
    var bot = pushMessage({ role: "bot", who: model.displayName, text: "", pending: true });
    var body = new FormData();
    body.append("file", file, file.name || "audio.webm");
    body.append("model", model.id);
    var res = await apiFetch("/v1/audio/transcriptions", {
      method: "POST",
      body: body,
      signal: state.abort ? state.abort.signal : undefined,
      timeout: 180000
    });
    state.calls += 1;
    renderMetrics();
    if (!res.ok) {
      var explained = await readExplained(res, "audio");
      updateMessage(bot, { text: joinExplain(explained), error: true, pending: false, who: "网关" });
      return;
    }
    var data = await res.json();
    var text = L.extractTranscript(data).trim();
    if (!text) {
      updateMessage(bot, { text: "转写接口没有返回文字。请管理员确认语音模型是否已接入。", error: true, pending: false, who: "网关" });
      return;
    }
    updateMessage(bot, { text: text, pending: false });
  }

  async function send() {
    if (state.sending) return;
    setComposerError("");
    var agent = currentAgent();
    var model = currentModel();
    if (!state.token) { setComposerError("请先登录。"); return; }
    if (!model) { setComposerError("请先选择一个模型。"); return; }
    if (agent.mode !== "image" && agent.mode !== "audio" && model.kinds.indexOf("embedding") !== -1) {
      setComposerError("这是向量模型，不能用来对话。");
      return;
    }
    var text = $("prompt").value.trim();
    if (agent.mode === "audio") {
      if (!state.audioFile) { setComposerError("请先选择一段录音。"); return; }
      if (!audioReady() && model.kinds.indexOf("audio") === -1) {
        setComposerError("语音转写尚未接入。当前令牌没有可用的语音模型。");
        return;
      }
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
      else if (agent.mode === "image") {
        $("prompt").value = "";
        await sendImage(model, text);
      } else {
        var image = state.attachment;
        state.attachment = null;
        $("prompt").value = "";
        renderAttachment();
        await sendChat(model, agent, text, agent.mode === "vision" ? image : null);
      }
    } catch (err) {
      var pending = state.messages[state.messages.length - 1];
      if (err && err.network === "abort") {
        var kept = (err.partial || (pending && pending.text) || "").trim();
        if (pending) updateMessage(pending, { text: kept ? kept + "\n\n已停止。" : "已停止。", error: false, pending: false });
      } else if (pending && pending.pending) {
        updateMessage(pending, { text: joinExplain(explainThrown(err, agent.mode === "audio" ? "audio" : agent.mode === "image" ? "image" : "")), error: true, pending: false, who: "网关" });
      } else setComposerError(joinExplain(explainThrown(err)));
    } finally {
      state.sending = false;
      state.abort = null;
      renderComposer();
      renderMetrics();
      $("prompt").focus();
    }
  }

  async function probe() {
    var model = L.pickModel(state.models, "qa");
    var result = $("probeResult");
    if (!model) { result.textContent = "没有可以试的对话模型。"; return; }
    result.textContent = "正在请求「" + model.id + "」，会消耗少量额度…";
    $("probeBtn").disabled = true;
    try {
      var res = await apiFetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.id,
          stream: false,
          max_tokens: 16,
          messages: [{ role: "user", content: "只回复一个字：好" }]
        }),
        timeout: 60000
      });
      state.calls += 1;
      renderMetrics();
      if (!res.ok) {
        result.textContent = joinExplain(await readExplained(res, "text"));
        return;
      }
      var data = await res.json();
      var text = L.extractAssistantText(data).trim();
      result.textContent = text ? "「" + model.id + "」有回复：" + text.slice(0, 80) : "接口通了，但模型没有返回文字。";
    } catch (err) {
      result.textContent = joinExplain(explainThrown(err));
    } finally {
      $("probeBtn").disabled = false;
    }
  }

  function copyText(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  function openSettings() {
    $("setName").value = state.name;
    $("setBase").value = state.base;
    $("setToken").value = "";
    $("setAdminUrl").value = state.adminUrl || L.defaultAdminUrl(location);
    $("setAdmin").checked = state.admin;
    $("settingsError").hidden = true;
    $("settings").showModal();
  }

  async function saveSettings(event) {
    event.preventDefault();
    var base = L.normalizeBase($("setBase").value);
    if (!base.ok) {
      $("settingsError").hidden = false;
      $("settingsError").textContent = base.error;
      return;
    }
    var adminUrl = $("setAdminUrl").value.trim() || L.defaultAdminUrl(location);
    var adminCheck = L.normalizeBase(adminUrl);
    if (!adminCheck.ok) {
      $("settingsError").hidden = false;
      $("settingsError").textContent = "管理后台地址：" + adminCheck.error;
      return;
    }
    var nextToken = $("setToken").value.trim();
    if (nextToken && (nextToken.length < 8 || nextToken.length > 300)) {
      $("settingsError").hidden = false;
      $("settingsError").textContent = "新令牌的长度看起来不对。";
      return;
    }
    var previousToken = state.token;
    if (nextToken) state.token = nextToken;
    state.base = base.value;
    try {
      var res = await apiFetch("/v1/models", { timeout: 20000 });
      if (!res.ok) {
        state.token = previousToken;
        $("settingsError").hidden = false;
        $("settingsError").textContent = joinExplain(await readExplained(res, ""));
        return;
      }
      var json = await res.json();
      state.models = L.parseModelsPayload(json);
      state.connected = true;
      state.connError = "";
      state.gatewayVersion = res.headers.get("x-new-api-version") || "";
      if (nextToken) storeSet(L.TOKEN_KEY, nextToken);
      storeSet(L.BASE_KEY, state.base);
      state.name = $("setName").value.trim().slice(0, 24);
      storeSet(L.NAME_KEY, state.name);
      state.admin = $("setAdmin").checked;
      storeSet(L.ADMIN_KEY, state.admin ? "1" : "0");
      state.adminUrl = adminCheck.value;
      storeSet(L.ADMIN_URL_KEY, state.adminUrl);
      if (!currentModel()) {
        var picked = L.pickModel(state.models, state.agentKey);
        state.modelId = picked ? picked.id : "";
      }
      $("settings").close();
      renderUser();
      renderStatus();
      renderMetrics();
      renderAgents();
      renderModels();
      renderComposer();
      renderChannels();
      renderFooter();
      refreshUsage();
      if (state.tab === "channels" && !state.admin) showTab("home");
    } catch (err) {
      state.token = previousToken;
      $("settingsError").hidden = false;
      $("settingsError").textContent = joinExplain(explainThrown(err));
    }
  }

  function loadStored() {
    state.token = storeGet(L.TOKEN_KEY);
    state.base = storeGet(L.BASE_KEY);
    state.name = storeGet(L.NAME_KEY);
    state.admin = storeGet(L.ADMIN_KEY) === "1";
    var storedAdmin = L.normalizeBase(storeGet(L.ADMIN_URL_KEY));
    state.adminUrl = storedAdmin.ok && storedAdmin.value ? storedAdmin.value : L.defaultAdminUrl(location);
    $("nameInput").value = state.name;
    $("baseInput").value = state.base;
    if (location.protocol === "file:") $("loginAdvanced").open = true;
  }

  function bind() {
    $("loginTheme").onclick = toggleTheme;
    $("themeBtn").onclick = toggleTheme;
    $("toggleToken").onclick = function () {
      var input = $("tokenInput");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      $("toggleToken").textContent = show ? "隐藏" : "显示";
    };
    $("loginForm").addEventListener("submit", onLogin);
    $("nav").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-tab]");
      if (button) showTab(button.dataset.tab);
    });
    document.addEventListener("click", function (event) {
      var agent = event.target.closest("[data-agent]");
      if (agent) openAgent(agent.dataset.agent);
    });
    $("userBtn").onclick = openSettings;
    $("closeSettings").onclick = function () { $("settings").close(); };
    $("settingsForm").addEventListener("submit", saveSettings);
    $("logoutBtn").onclick = function () { $("settings").close(); forceLogout(""); };
    $("retryBtn").onclick = refreshConnection;
    $("copyUrl").onclick = function () {
      var url = L.openaiBaseUrl(state.base, location.origin);
      if (!url) return;
      var ok = copyText(url);
      $("copyUrl").textContent = ok ? "已复制" : "复制失败";
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { $("copyUrl").textContent = "复制"; }, 1500);
    };
    $("modelFilter").addEventListener("input", function () {
      state.filter = $("modelFilter").value;
      renderModels();
    });
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
    $("pickImage").onclick = function () { $("imageInput").click(); };
    $("imageInput").onchange = function () {
      var file = $("imageInput").files && $("imageInput").files[0];
      $("imageInput").value = "";
      if (file) attachImageFile(file);
    };
    $("sampleImage").onclick = function () {
      state.attachment = { dataUrl: drawSampleImage(), name: "示例包装图" };
      setComposerError("");
      renderAttachment();
    };
    $("attachPreview").addEventListener("click", function (event) {
      if (event.target.id === "removeImage") {
        state.attachment = null;
        renderAttachment();
      }
    });
    $("pickAudio").onclick = function () { $("audioInput").click(); };
    $("audioInput").onchange = function () {
      var file = $("audioInput").files && $("audioInput").files[0];
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) {
        setComposerError("音频超过 25MB，请裁短后再试。");
        $("audioInput").value = "";
        return;
      }
      state.audioFile = file;
      $("audioState").textContent = "已选择：" + file.name;
      setComposerError("");
    };
    $("prompt").addEventListener("keydown", function (event) {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send();
      }
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
    var box = $("composerBox");
    ["dragenter", "dragover"].forEach(function (name) {
      box.addEventListener(name, function (event) {
        if (currentAgent().mode !== "vision") return;
        event.preventDefault();
        box.classList.add("drag");
      });
    });
    ["dragleave", "drop"].forEach(function (name) {
      box.addEventListener(name, function (event) {
        box.classList.remove("drag");
      });
    });
    box.addEventListener("drop", function (event) {
      if (currentAgent().mode !== "vision") return;
      event.preventDefault();
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) attachImageFile(file);
    });
    $("sendBtn").onclick = send;
    $("stopBtn").onclick = function () { if (state.abort) state.abort.abort(); };
    $("probeBtn").onclick = probe;
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
    var base = L.normalizeBase($("baseInput").value);
    if (!base.ok) { showLoginError(base.error); return; }
    var token = $("tokenInput").value.trim();
    if (token.length < 8 || token.length > 300) {
      showLoginError("请粘贴网关令牌。它一般以 sk- 开头，从 New API 的「令牌」页复制。");
      return;
    }
    state.token = token;
    state.base = base.value;
    state.name = $("nameInput").value.trim().slice(0, 24);
    setLoginBusy(true, "正在验证…");
    showLoginError("");
    try {
      var res = await apiFetch("/v1/models", { timeout: 20000 });
      if (!res.ok) {
        state.token = "";
        showLoginError(joinExplain(await readExplained(res, "")));
        return;
      }
      var json = await res.json();
      storeSet(L.TOKEN_KEY, token);
      storeSet(L.BASE_KEY, state.base);
      storeSet(L.NAME_KEY, state.name);
      $("tokenInput").value = "";
      state.models = L.parseModelsPayload(json);
      state.connected = true;
      state.connError = "";
      state.gatewayVersion = res.headers.get("x-new-api-version") || "";
      var picked = L.pickModel(state.models, state.agentKey);
      state.modelId = picked ? picked.id : (state.models[0] ? state.models[0].id : "");
      enterApp();
      refreshUsage();
    } catch (err) {
      state.token = "";
      showLoginError(err && err.network ? joinExplain(explainThrown(err)) : "网关返回了无法识别的内容。");
    } finally {
      setLoginBusy(false);
    }
  }

  function stripSecretQuery() {
    var params = new URLSearchParams(location.search);
    if (!params.has("token") && !params.has("key") && !params.has("sk")) return;
    params.delete("token");
    params.delete("key");
    params.delete("sk");
    var query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + location.hash);
    showLoginError("不要把令牌放在网址里。请粘贴到输入框，网址里的参数已去掉。");
  }

  bind();
  applyTheme(document.documentElement.getAttribute("data-theme") || "light");
  stripSecretQuery();
  loadStored();
  if (state.token) {
    enterApp();
    refreshConnection();
  }
})();
