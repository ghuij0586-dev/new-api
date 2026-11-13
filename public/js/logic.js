(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GatewayLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var THEME_KEY = "gw.theme";
  var TOKEN_KEY = "gw.token";
  var BASE_KEY = "gw.base";
  var NAME_KEY = "gw.name";
  var ADMIN_KEY = "gw.admin";
  var ADMIN_URL_KEY = "gw.adminUrl";

  function redact(text) {
    return String(text || "")
      .replace(/Bearer\s+\S+/gi, "Bearer ****")
      .replace(/sk-[A-Za-z0-9_-]{2,}/g, "sk-****");
  }

  function normalizeBase(input) {
    var raw = String(input || "").trim();
    if (!raw) return { ok: true, value: "" };
    if (!/^https?:\/\//i.test(raw)) {
      return { ok: false, error: "地址需要以 http:// 或 https:// 开头。部署在服务器上时请留空，浏览器会走当前网站。" };
    }
    var url;
    try {
      url = new URL(raw);
    } catch (e) {
      return { ok: false, error: "这个地址无法识别，请检查是否多了空格。" };
    }
    if (url.username || url.password) {
      return { ok: false, error: "地址里不要写账号、密码或令牌。" };
    }
    if (url.search || url.hash) {
      return { ok: false, error: "地址里不要带问号参数。令牌请填在令牌框，不要放进网址。" };
    }
    var path = url.pathname.replace(/\/+$/, "");
    path = path.replace(/\/v1$/i, "");
    path = path.replace(/\/api\/usage\/token$/i, "");
    if (path === "/") path = "";
    if (path) {
      return { ok: false, error: "只填写到端口即可，例如 http://43.110.30.115:3000。末尾的 /v1 可以省略。" };
    }
    return { ok: true, value: url.origin };
  }

  function apiUrl(base, path) {
    var p = path.charAt(0) === "/" ? path : "/" + path;
    var b = String(base || "").replace(/\/+$/, "");
    return b ? b + p : p;
  }

  function openaiBaseUrl(base, pageOrigin) {
    if (base) return String(base).replace(/\/+$/, "") + "/v1";
    if (!pageOrigin || pageOrigin === "null" || String(pageOrigin).indexOf("file:") === 0) return "";
    return String(pageOrigin).replace(/\/+$/, "") + "/v1";
  }

  function maskToken(token) {
    var t = String(token || "");
    if (t.length < 10) return "已保存";
    var prefix = t.indexOf("sk-") === 0 ? "sk-" : "";
    var rest = prefix ? t.slice(3) : t;
    return prefix + rest.slice(0, 4) + "****" + rest.slice(-2);
  }

  function cleanOwnedBy(value) {
    var s = String(value || "").trim();
    if (!s) return "";
    if (/sk-|token|secret|key/i.test(s)) return "";
    if (s.length > 40) return "";
    if (/^(custom|system|openai|default|organization|unknown|owner)$/i.test(s)) return "";
    return s;
  }

  function kindsFor(id) {
    var s = String(id || "").toLowerCase();
    if (!s) return [];
    if (/embedding|embed-|bge-|m3e|rerank/.test(s)) return ["embedding"];
    if (/(?:dall-e|dalle|wanx|wanxiang|wan2(?:\.|-)|flux|stable-diffusion|sdxl|kolors|cogview|imagen|seedream|gpt-image|qwen-image|jimeng|midjourney|\bmj-)/.test(s)) {
      return ["image"];
    }
    if (/(?:whisper|paraformer|sensevoice|transcrib|\basr\b|speech-to-text|\bstt\b|(?:^|[-_/])audio(?:[-_]|$))/.test(s)) {
      return ["audio"];
    }
    var kinds = [];
    if (/(?:^|[^a-z])vl(?:[^a-z]|$)|vision|qvq|gpt-4o|glm-4v|-4v\b|omni/.test(s)) kinds.push("vision");
    kinds.push("text");
    return kinds;
  }

  function vendorOf(id, ownedBy) {
    var s = String(id || "").toLowerCase();
    var o = String(ownedBy || "").toLowerCase();
    var rules = [
      [/qwen|wanx|wan2|tongyi|qwq|qvq|bailian|dashscope|aliyun|alibaba/, "阿里云百炼"],
      [/doubao|skylark|seedream|volcengine|jimeng|bytedance/, "火山引擎"],
      [/glm|cogview|zhipu|chatglm|bigmodel/, "智谱"],
      [/abab|minimax|speech-0/, "MiniMax"],
      [/deepseek/, "DeepSeek"],
      [/moonshot|kimi/, "月之暗面"],
      [/ernie|wenxin|qianfan/, "百度文心"],
      [/spark|xinghuo|iflytek/, "讯飞星火"],
      [/hunyuan/, "腾讯混元"],
      [/claude|anthropic/, "Anthropic"],
      [/gemini|imagen/, "Google"],
      [/gpt-|dall-e|whisper|\bo1\b|\bo3\b|\bo4\b/, "OpenAI"]
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(s) || rules[i][0].test(o)) return rules[i][1];
    }
    return "其他";
  }

  function displayName(id) {
    var s = String(id || "").toLowerCase();
    var rules = [
      [/qwen.*vl|qvq|qwen2\.5-vl|qwen3-vl/, "通义千问视觉"],
      [/qwen|qwq/, "通义千问"],
      [/wanx|wanxiang|wan2/, "通义万相"],
      [/doubao.*vision|doubao.*vl/, "豆包视觉"],
      [/doubao|skylark/, "豆包"],
      [/glm-4v|glm.*vision/, "GLM 视觉"],
      [/cogview/, "CogView"],
      [/glm|chatglm/, "智谱 GLM"],
      [/whisper|paraformer|sensevoice/, "语音转写"],
      [/dall-e|dalle|gpt-image/, "图像生成"],
      [/flux/, "Flux"],
      [/deepseek/, "DeepSeek"],
      [/kimi|moonshot/, "Kimi"],
      [/gemini/, "Gemini"],
      [/claude/, "Claude"],
      [/gpt-4o/, "GPT-4o"],
      [/gpt-/, "GPT"]
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(s)) return rules[i][1];
    }
    return id;
  }

  function tagsFor(kinds) {
    var map = { text: "对话", vision: "识图", image: "生图", audio: "语音", embedding: "向量" };
    var out = [];
    for (var i = 0; i < kinds.length; i++) {
      if (map[kinds[i]]) out.push(map[kinds[i]]);
    }
    return out;
  }

  function classifyModel(raw) {
    var id = String(raw && raw.id || "").trim();
    var owned = cleanOwnedBy(raw && (raw.owned_by || raw.ownedBy));
    var kinds = kindsFor(id);
    return {
      id: id,
      ownedBy: owned,
      kinds: kinds,
      vendor: vendorOf(id, owned),
      displayName: displayName(id),
      tags: tagsFor(kinds)
    };
  }

  function parseModelsPayload(json) {
    var list = json && Array.isArray(json.data) ? json.data : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var model = classifyModel(list[i]);
      if (model.id) out.push(model);
    }
    return out;
  }

  function scoreModel(model, agentKey) {
    var id = String(model.id || "").toLowerCase();
    var kinds = model.kinds || [];
    if (kinds.indexOf("embedding") !== -1) return 0;
    if (agentKey === "vision") {
      if (kinds.indexOf("vision") === -1) return 0;
      var bonus = 0;
      if (/vl|vision|qvq|glm-4v/.test(id)) bonus += 20;
      else if (/4o/.test(id)) bonus += 5;
      return 100 + bonus;
    }
    if (agentKey === "image") {
      if (kinds.indexOf("image") === -1) return 0;
      return 100 + (/wanx|wan2|dall-e|flux|cogview|seedream|kolors/.test(id) ? 5 : 0);
    }
    if (agentKey === "audio") {
      if (kinds.indexOf("audio") === -1) return 0;
      return 100 + (/whisper|paraformer|sensevoice|transcri/.test(id) ? 8 : 0);
    }
    if (kinds.indexOf("text") === -1 && kinds.indexOf("vision") === -1) return 0;
    var s = kinds.indexOf("vision") !== -1 ? 45 : 70;
    if (agentKey === "write" && /max|plus|long|pro/.test(id)) s += 15;
    if (agentKey === "qa" && /turbo|flash|mini|lite/.test(id)) s += 8;
    if (/qwen-plus|glm-4|deepseek-chat|doubao/.test(id) && !/vl|vision/.test(id)) s += 6;
    return s;
  }

  function pickModel(models, agentKey) {
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < models.length; i++) {
      var score = scoreModel(models[i], agentKey);
      if (score > bestScore || (score === bestScore && score > 0 && best && models[i].id.localeCompare(best.id) < 0)) {
        best = models[i];
        bestScore = score;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function capabilitySet(models) {
    var found = { text: false, vision: false, image: false, audio: false };
    for (var i = 0; i < models.length; i++) {
      var kinds = models[i].kinds || [];
      for (var k = 0; k < kinds.length; k++) {
        if (found.hasOwnProperty(kinds[k])) found[kinds[k]] = true;
      }
    }
    var labels = [];
    if (found.text) labels.push("对话");
    if (found.vision) labels.push("识图");
    if (found.image) labels.push("生图");
    if (found.audio) labels.push("语音");
    return { found: found, labels: labels, count: labels.length };
  }

  function contentToText(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    var parts = [];
    for (var i = 0; i < content.length; i++) {
      var part = content[i];
      if (typeof part === "string") parts.push(part);
      else if (part && part.type === "text" && typeof part.text === "string") parts.push(part.text);
    }
    return parts.join("");
  }

  function extractAssistantText(data) {
    var choice = data && data.choices && data.choices[0];
    if (!choice) return "";
    var msg = choice.message || {};
    var text = contentToText(msg.content);
    if (!text && typeof msg.reasoning_content === "string") text = msg.reasoning_content;
    if (!text && choice.delta) {
      text = contentToText(choice.delta.content);
      if (!text && typeof choice.delta.reasoning_content === "string") text = choice.delta.reasoning_content;
    }
    return text || "";
  }

  function extractTranscript(data) {
    if (!data || typeof data !== "object") return "";
    if (typeof data.text === "string") return data.text;
    if (data.data && typeof data.data.text === "string") return data.data.text;
    return "";
  }

  function safeImageSrc(src) {
    if (typeof src !== "string") return "";
    var s = src.trim();
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
    try {
      var url = new URL(s);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      if (url.username || url.password) return "";
      return s;
    } catch (e) {
      return "";
    }
  }

  function extractImageResult(data) {
    var item = data && data.data && data.data[0];
    if (!item) return null;
    if (typeof item.b64_json === "string" && item.b64_json) {
      var b64 = item.b64_json.replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
      var mime = typeof item.mime_type === "string" ? item.mime_type : "image/png";
      if (!/^image\/(?:png|jpeg|jpg|webp|gif)$/.test(mime)) mime = "image/png";
      var src = safeImageSrc("data:" + mime + ";base64," + b64);
      return src ? { src: src } : null;
    }
    if (typeof item.url === "string") {
      var safe = safeImageSrc(item.url);
      if (safe) return { src: safe };
    }
    return null;
  }

  function extractServerMessage(raw) {
    var text = String(raw || "").trim();
    if (!text) return "";
    try {
      var json = JSON.parse(text);
      var msg = (json.error && (json.error.message || json.error.msg)) || json.message || json.msg || "";
      return typeof msg === "string" ? redact(msg).trim() : "";
    } catch (e) {
      if (/<html|<\s*body/i.test(text)) return "";
      return redact(text).slice(0, 180);
    }
  }

  function extractRequestId(text) {
    var matched = String(text || "").match(/request id:\s*([0-9A-Za-z]+)/i);
    return matched ? matched[1] : "";
  }

  function explainHttpError(input) {
    var status = Number(input && input.status) || 0;
    var context = (input && input.context) || "";
    var network = (input && input.network) || "";
    var raw = String(input && input.raw || "");
    var serverMessage = extractServerMessage(raw);
    var requestId = extractRequestId(serverMessage || raw);
    var msg = serverMessage || "";
    var low = msg.toLowerCase();

    if (network === "abort") {
      return { title: "已停止。", detail: "这次生成已经中断。" };
    }
    if (network === "timeout") {
      return { title: "等待时间过长，请求已取消。", detail: "可以重试。如果经常超时，请管理员检查对应渠道是否卡住。" };
    }
    if (network === "network" || status === 0) {
      return {
        title: "浏览器没有连上网关。",
        detail: "如果页面是用本地文件直接打开的，浏览器通常会拦截跨域请求。请改用部署在服务器 80 端口的融光地址，让页面和接口同一来源。只有在设置里改成带端口的地址时，才依赖网关自身的跨域配置。"
      };
    }

    var title = "调用没有成功。";
    if (status === 401 || /invalid token|无效的令牌|unauthorized|未授权|access token is invalid/.test(low)) {
      title = "令牌无效、已过期或已被禁用。";
    } else if (status === 403 || /无权|permission denied|forbidden/.test(low)) {
      title = "这把令牌没有权限调用该模型。";
    } else if (status === 402 || /quota|insufficient|额度不足|额度已用|余额不足|used up/.test(low)) {
      title = "额度不足，网关拒绝了这次调用。";
    } else if (status === 429 || /rate limit|负载已饱和|too many requests/.test(low)) {
      title = "请求太频繁，或触发了限流。请稍后再试。";
    } else if (status === 413) {
      title = "文件太大，网关没有接收。";
    } else if (context === "audio" && (status === 404 || status === 405 || status === 501 || /not implemented|尚未|不支持转写/.test(low))) {
      title = "语音转写尚未接入。";
    } else if (context === "image" && (status === 404 || status === 405 || status === 501 || /not implemented|不支持生图|unknown endpoint/.test(low))) {
      title = "生图接口还没有配置好。";
    } else if (status === 404 || /model_not_found|model not found|无可用渠道|无此模型|no available channel/.test(low)) {
      title = "没有找到这个模型或可用渠道。";
    } else if (status === 502 || status === 503 || status === 504) {
      title = "融光连不上后面的 New API，或上游响应超时。";
    } else if (status >= 500) {
      title = "网关内部出错了。";
    } else if (status === 400) {
      title = "网关没有接受这次请求。";
    }

    var bits = [];
    if (title === "语音转写尚未接入。") {
      bits.push("融光不会编造转写文字。请管理员在 New API 接入语音渠道，并给这把令牌放开对应模型。");
    }
    if (title === "生图接口还没有配置好。") {
      bits.push("融光不会展示假图片。请管理员确认该模型已接入，并且开放了图像生成。");
    }
    if (status === 401) {
      bits.push("请使用 New API 管理后台「令牌」页签发的网关令牌，不要填写厂商控制台的密钥。");
    }
    if (status === 502 || status === 503 || status === 504) {
      bits.push("请确认原来的 new-api 容器仍在运行，并且没有被这次部署停掉。");
    }
    if (requestId) bits.push("请求编号 " + requestId);
    if (msg && !/invalid token/i.test(msg)) {
      var clipped = msg.length > 180 ? msg.slice(0, 180) + "…" : msg;
      if (clipped && clipped !== title) bits.push(clipped);
    }
    return { title: title, detail: bits.join(" ") };
  }

  function createSseParser(onEvent) {
    var buf = "";
    function take(line) {
      if (line.indexOf("data:") !== 0) return;
      onEvent(line.slice(5).replace(/^\s/, ""));
    }
    return {
      push: function (text) {
        buf += String(text || "");
        var lines = buf.split("\n");
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) take(lines[i].replace(/\r$/, ""));
      },
      flush: function () {
        if (buf) take(buf.replace(/\r$/, ""));
        buf = "";
      }
    };
  }

  function sseDelta(payload) {
    if (payload === "[DONE]") return { done: true };
    var json;
    try {
      json = JSON.parse(payload);
    } catch (e) {
      return { ignore: true };
    }
    if (json.error) {
      return { error: redact(json.error.message || json.message || "模型返回错误") };
    }
    var choice = json.choices && json.choices[0];
    if (!choice) return { ignore: true };
    var delta = choice.delta || {};
    var message = choice.message || {};
    var content = typeof delta.content === "string" ? delta.content : contentToText(message.content);
    var reasoning = typeof delta.reasoning_content === "string"
      ? delta.reasoning_content
      : (typeof message.reasoning_content === "string" ? message.reasoning_content : "");
    return { content: content || "", reasoning: reasoning || "" };
  }

  function parseUsagePayload(json) {
    if (!json || typeof json !== "object") return null;
    var data = json.data && typeof json.data === "object" ? json.data : json;
    if (!("total_used" in data) && !("unlimited_quota" in data) && !("total_granted" in data)) return null;
    return data;
  }

  function quotaSummary(usage) {
    if (!usage || typeof usage !== "object") {
      return { known: false, advice: "暂时没有读到额度。请管理员在 New API 后台查看这把令牌。" };
    }
    var used = Number(usage.total_used);
    var granted = Number(usage.total_granted);
    var available = Number(usage.total_available);
    if (!isFinite(used)) used = 0;
    if (!isFinite(granted)) granted = 0;
    if (!isFinite(available)) available = 0;
    var unlimited = Boolean(usage.unlimited_quota);
    var percent = null;
    if (!unlimited && granted > 0) percent = Math.max(0, Math.min(100, Math.round((used / granted) * 100)));
    var advice;
    if (unlimited) advice = "这把令牌不限额。如果十几位同事共用一把，建议改成每人一把并设置上限。";
    else if (percent == null) advice = "网关返回了用量，但没有总额，无法计算百分比。";
    else if (percent >= 80) advice = "额度已用过八成。请尽快让管理员追加，避免同事调用到一半被拒绝。";
    else if (percent >= 50) advice = "额度已用过半。生图通常更贵，建议单独给生图设上限。";
    else advice = "额度还比较充裕。对话和识图可以正常使用。";
    var expiresAt = Number(usage.expires_at) > 0 ? Number(usage.expires_at) : 0;
    var limitsOn = Boolean(usage.model_limits_enabled);
    var limits = [];
    if (limitsOn && usage.model_limits && typeof usage.model_limits === "object") {
      var keys = Object.keys(usage.model_limits);
      for (var i = 0; i < keys.length; i++) {
        if (usage.model_limits[keys[i]]) limits.push(keys[i]);
      }
    }
    return {
      known: true,
      name: typeof usage.name === "string" ? usage.name : "",
      unlimited: unlimited,
      used: used,
      granted: granted,
      available: available,
      percent: percent,
      advice: advice,
      expiresAt: expiresAt,
      limitsOn: limitsOn,
      limits: limits
    };
  }

  function formatCount(n) {
    return new Intl.NumberFormat("zh-CN").format(Math.round(Number(n) || 0));
  }

  function shouldFallbackImage(status) {
    return status === 400 || status === 404 || status === 405 || status === 415 || status === 501;
  }

  function defaultAdminUrl(locationLike) {
    var loc = locationLike || {};
    if (!loc.protocol || loc.protocol === "file:") return "http://43.110.30.115:3000";
    var host = loc.hostname || "";
    if (!host || host === "localhost" || host === "127.0.0.1") return "http://43.110.30.115:3000";
    var protocol = loc.protocol === "https:" ? "https:" : "http:";
    return protocol + "//" + host + ":3000";
  }

  return {
    THEME_KEY: THEME_KEY,
    TOKEN_KEY: TOKEN_KEY,
    BASE_KEY: BASE_KEY,
    NAME_KEY: NAME_KEY,
    ADMIN_KEY: ADMIN_KEY,
    ADMIN_URL_KEY: ADMIN_URL_KEY,
    redact: redact,
    normalizeBase: normalizeBase,
    apiUrl: apiUrl,
    openaiBaseUrl: openaiBaseUrl,
    maskToken: maskToken,
    classifyModel: classifyModel,
    parseModelsPayload: parseModelsPayload,
    scoreModel: scoreModel,
    pickModel: pickModel,
    capabilitySet: capabilitySet,
    vendorOf: vendorOf,
    extractAssistantText: extractAssistantText,
    extractTranscript: extractTranscript,
    extractImageResult: extractImageResult,
    safeImageSrc: safeImageSrc,
    explainHttpError: explainHttpError,
    createSseParser: createSseParser,
    sseDelta: sseDelta,
    parseUsagePayload: parseUsagePayload,
    quotaSummary: quotaSummary,
    formatCount: formatCount,
    shouldFallbackImage: shouldFallbackImage,
    defaultAdminUrl: defaultAdminUrl
  };
});
