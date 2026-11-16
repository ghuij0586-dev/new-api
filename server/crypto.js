import crypto from "node:crypto";

const PREFIX = "rg1:";

export function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function deriveKey(secret) {
  return crypto.scryptSync(String(secret || ""), "rongguang-at-rest-v1", 32);
}

export function encryptString(secret, text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const body = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString("base64url");
}

export function decryptString(secret, payload) {
  const raw = String(payload || "");
  if (!raw.startsWith(PREFIX)) {
    throw new Error("无法读取已保存的数据");
  }
  const buf = Buffer.from(raw.slice(PREFIX.length), "base64url");
  if (buf.length < 12 + 16) throw new Error("无法读取已保存的数据");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const body = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export function encryptPassword(password, publicKey) {
  let pem = String(publicKey || "").trim();
  if (!pem.includes("BEGIN")) {
    const wrapped = pem.replace(/\s+/g, "").match(/.{1,64}/g) || [];
    pem = `-----BEGIN PUBLIC KEY-----\n${wrapped.join("\n")}\n-----END PUBLIC KEY-----`;
  }
  return crypto
    .publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      },
      Buffer.from(String(password), "utf8")
    )
    .toString("base64");
}
