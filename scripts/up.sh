#!/usr/bin/env bash
# 只启动同事门户。不会停止、删除或重建名为 new-api 的容器。
set -euo pipefail
cd "$(dirname "$0")/.."

if grep -Eq 'container_name:[[:space:]]*new-api[[:space:]]*$' docker-compose.yml; then
  echo "已停止：这个 compose 文件不应该管理 new-api 容器。"
  exit 1
fi

echo "工作目录：$(pwd)"
if docker ps --format '{{.Names}}' | grep -qx 'new-api'; then
  echo "已确认 new-api 正在运行。这次只处理同事门户，不会重启它。"
else
  echo "提示：没有找到名为 new-api 的运行中容器。"
  echo "如果 New API 仍在 3000 端口提供服务，可以继续。本脚本不会执行 docker stop 或 docker rm。"
fi

if ! docker compose up -d --build; then
  echo
  echo "启动失败。如果是 80 端口被占用，把 docker-compose.yml 里的 \"80:80\" 改成 \"8080:80\"，保存后再执行一次。"
  echo "不要对名为 new-api 的容器执行 docker rm 或 docker stop。"
  exit 1
fi

echo
docker ps --filter name=gateway-portal --filter name=new-api --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

if ! command -v curl >/dev/null 2>&1; then
  echo "服务器没有 curl，跳过自动检查。请用浏览器打开 http://43.110.30.115/"
  exit 0
fi

echo
echo "门户健康检查："
curl -fsS http://127.0.0.1/healthz
echo
echo "转发检查（没有令牌时看到 401，说明已经转到 New API）："
code="$(curl -sS -o /tmp/gateway-portal-models.json -w '%{http_code}' http://127.0.0.1/v1/models || true)"
echo "HTTP ${code}"
head -c 180 /tmp/gateway-portal-models.json || true
echo
if [ "${code}" != "401" ]; then
  echo "提示：没有令牌时，这里期望是 401。如果是 502 或 000，门户还没连上 3000 端口的 New API。"
  echo "请确认 new-api 容器仍在运行。不要为了排错去执行 docker rm new-api。"
fi
rm -f /tmp/gateway-portal-models.json
echo "同事打开：http://43.110.30.115/"
echo "管理后台仍然是：http://43.110.30.115:3000"
