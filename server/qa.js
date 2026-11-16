export const UNKNOWN_TEXT = "根据当前项目资料，我不知道。";

const STOP = new Set([
  "什么", "怎么", "如何", "我们", "这个", "一下", "可以", "是否", "请问", "多少",
  "哪里", "哪儿", "为什么", "还是", "一个", "没有", "不是", "以及", "如果", "那么",
  "一下", "请问", "能否", "是不是", "有没有", "哪些", "哪个"
]);

export function chunkText(text) {
  const clean = String(text || "").replace(/\u0000/g, "").replace(/\r/g, "").trim();
  if (!clean) return [];
  const size = 480;
  const step = 400;
  const out = [];
  for (let i = 0; i < clean.length && out.length < 80; i += step) {
    out.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return out;
}

function cjk(text) {
  return (String(text || "").match(/[\u4e00-\u9fff]/g) || []).join("");
}

function contentBigrams(text) {
  const chars = cjk(text);
  const out = [];
  for (let i = 0; i + 1 < chars.length; i += 1) {
    const gram = chars.slice(i, i + 2);
    if (!STOP.has(gram)) out.push(gram);
  }
  return out;
}

function latinWords(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];
}

export function scoreChunk(question, chunk) {
  const grams = contentBigrams(question);
  const words = latinWords(question);
  const hay = cjk(chunk);
  const latin = new Set(latinWords(chunk));
  const seen = new Set();
  let score = 0;
  for (const gram of grams) {
    if (seen.has(gram)) continue;
    seen.add(gram);
    if (hay.includes(gram)) score += 1;
  }
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (latin.has(word)) score += 2;
  }
  const sequences = String(question || "").match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const seq of sequences) {
    if (STOP.has(seq)) continue;
    if (hay.includes(seq)) score += 2;
  }
  return score;
}

function excerptAround(text, question) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const needles = []
    .concat(String(question || "").match(/[\u4e00-\u9fff]{2,}/g) || [])
    .concat(latinWords(question));
  let at = -1;
  for (const needle of needles) {
    if (STOP.has(needle)) continue;
    const found = clean.toLowerCase().indexOf(String(needle).toLowerCase());
    if (found >= 0) {
      at = found;
      break;
    }
  }
  if (at < 0) return clean.slice(0, 80);
  const start = Math.max(0, at - 24);
  const end = Math.min(clean.length, at + 56);
  return clean.slice(start, end).trim();
}

export function buildMessages(question, citations) {
  const blocks = citations
    .map((item, index) => `[${index + 1}] 文件：${item.filename}\n${item.excerpt}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content:
        "你是融光的项目资料问答。你只能根据用户给出的摘录回答，禁止使用摘录以外的知识、常识或猜测。" +
        "如果摘录里没有答案，只能回复这一句：" +
        UNKNOWN_TEXT +
        " 如果可以回答，必须用中文，写明来源文件名，并附上摘录原句。"
    },
    {
      role: "user",
      content: `摘录：\n${blocks}\n\n问题：${question}`
    }
  ];
}

function sharesEvidence(answer, excerpts) {
  const compact = String(answer || "").replace(/\s+/g, "");
  const hay = excerpts.map((item) => String(item || "").replace(/\s+/g, "")).join("\n");
  for (let i = 0; i + 4 <= compact.length; i += 1) {
    const gram = compact.slice(i, i + 4);
    if (/[\u4e00-\u9fff]{4}/.test(gram) && hay.includes(gram)) return true;
  }
  const words = latinWords(answer).filter((word) => word.length >= 4);
  const lower = hay.toLowerCase();
  return words.some((word) => lower.includes(word));
}

function extractiveAnswer(citations) {
  const lines = ["根据当前项目资料，可以确认这些内容："];
  citations.forEach((item) => {
    lines.push("来源：" + item.filename);
    lines.push(item.excerpt);
  });
  return lines.join("\n");
}

export function prepareQa(question, documents) {
  const chunks = [];
  for (const doc of documents || []) {
    const filename = String(doc.filename || "资料").slice(0, 80);
    for (const piece of chunkText(doc.text)) {
      chunks.push({ filename, text: piece, score: scoreChunk(question, piece) });
    }
  }
  chunks.sort((a, b) => b.score - a.score || a.filename.localeCompare(b.filename));
  const picked = chunks.filter((item) => item.score >= 2).slice(0, 4);
  if (!picked.length) {
    return {
      unknown: true,
      text: UNKNOWN_TEXT,
      citations: [],
      messages: [],
      excerpts: []
    };
  }
  const citations = picked.map((item) => ({
    filename: item.filename,
    excerpt: excerptAround(item.text, question)
  }));
  return {
    unknown: false,
    text: "",
    citations,
    messages: buildMessages(question, citations),
    excerpts: picked.map((item) => item.text)
  };
}

export function finalizeQa(prep, modelText) {
  if (!prep || prep.unknown) {
    return { unknown: true, text: UNKNOWN_TEXT, citations: [] };
  }
  const citations = prep.citations || [];
  const raw = String(modelText || "").trim();
  const grounded = Boolean(raw && sharesEvidence(raw, prep.excerpts || []));
  let text = grounded ? raw : extractiveAnswer(citations);
  const missing = citations.filter((item) => !text.includes(item.filename));
  if (missing.length) {
    text += "\n" + missing.map((item) => `来源：${item.filename}`).join("\n");
  }
  return { unknown: false, text, citations };
}
