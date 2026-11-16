import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_TEXT = 200000;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    let size = 0;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 20000);
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAX_TEXT * 4) out.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (err.length < 8) err.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(err).toString("utf8").trim().slice(0, 180);
        reject(new Error(detail || `${cmd} 没有成功`));
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

function clip(text) {
  const clean = String(text || "").replace(/\u0000/g, "").replace(/\r/g, "").trim();
  if (clean.length <= MAX_TEXT) return { text: clean, clipped: false };
  return { text: clean.slice(0, MAX_TEXT), clipped: true };
}

function docxXmlToText(xml) {
  return String(xml || "")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function withTemp(buffer, ext, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rg-doc-"));
  const file = path.join(dir, "upload" + ext);
  fs.writeFileSync(file, buffer);
  try {
    return await fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function extensionOf(filename) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(String(filename || "").trim());
  return match ? match[1].toLowerCase() : "";
}

export async function extractDocument(filename, buffer) {
  const ext = extensionOf(filename);
  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return { ext: "." + ext, ...clip(buffer.toString("utf8")) };
  }
  if (ext === "pdf") {
    if (buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
      throw new Error("这不是可读取的 PDF。");
    }
    const text = await withTemp(buffer, ".pdf", (file) => run("pdftotext", ["-enc", "UTF-8", "-layout", file, "-"]));
    return { ext: ".pdf", ...clip(text) };
  }
  if (ext === "docx") {
    if (buffer.subarray(0, 2).toString("utf8") !== "PK") {
      throw new Error("这不是可读取的 Word 文件。");
    }
    const xml = await withTemp(buffer, ".docx", (file) => run("unzip", ["-p", file, "word/document.xml"]));
    return { ext: ".docx", ...clip(docxXmlToText(xml)) };
  }
  throw new Error("只支持 txt、md、pdf、docx。");
}
