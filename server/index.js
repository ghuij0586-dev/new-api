import { createApp } from "./app.js";

function newApiBase() {
  if (process.env.NEW_API_BASE) return String(process.env.NEW_API_BASE).replace(/\/+$/, "");
  const upstream = process.env.NEW_API_UPSTREAM || "host.docker.internal:3000";
  if (/^https?:\/\//i.test(upstream)) return upstream.replace(/\/+$/, "");
  return "http://" + upstream.replace(/\/+$/, "");
}

const secret = process.env.SESSION_SECRET || "";
if (!secret) {
  console.error("缺少 SESSION_SECRET。请在环境变量或数据卷里提供，不要把密钥写进仓库。");
  process.exit(1);
}

const server = createApp({
  dataDir: process.env.DATA_DIR || "/data",
  sessionSecret: secret,
  newApiBase: newApiBase(),
  staticDir: process.env.STATIC_DIR || ""
});

const host = process.env.BFF_HOST || "127.0.0.1";
const port = Number(process.env.BFF_PORT || 8081);
server.listen(port, host, () => {
  console.log(`融光 BFF 已在 ${host}:${port} 监听`);
});
