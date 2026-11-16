#!/bin/sh
# 同时启动融光 BFF 和 nginx。不会停止或删除名为 new-api 的容器。
set -eu

mkdir -p /data/docs /tmp/nginx /var/log/nginx

if [ -z "${SESSION_SECRET:-}" ]; then
  if [ -s /data/session.secret ]; then
    SESSION_SECRET=$(cat /data/session.secret)
  else
    SESSION_SECRET=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
    umask 077
    printf '%s' "$SESSION_SECRET" > /data/session.secret
  fi
  export SESSION_SECRET
fi

if [ -z "${NEW_API_BASE:-}" ]; then
  case "${NEW_API_UPSTREAM:-host.docker.internal:3000}" in
    http://*|https://*) NEW_API_BASE="${NEW_API_UPSTREAM}" ;;
    *) NEW_API_BASE="http://${NEW_API_UPSTREAM:-host.docker.internal:3000}" ;;
  esac
  export NEW_API_BASE
fi

export BFF_UPSTREAM="${BFF_UPSTREAM:-127.0.0.1:8081}"
export NEW_API_UPSTREAM="${NEW_API_UPSTREAM:-host.docker.internal:3000}"

mkdir -p /tmp/nginx-conf
envsubst '${NEW_API_UPSTREAM} ${BFF_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template > /tmp/nginx-conf/server.conf

cat > /tmp/nginx-conf/nginx.conf <<'EOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /tmp/nginx/nginx.pid;
events { worker_connections 256; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  access_log /var/log/nginx/access.log;
  sendfile on;
  keepalive_timeout 65;
  include /tmp/nginx-conf/server.conf;
}
EOF

node /opt/rongguang/server/index.js &
node_pid=$!
nginx -c /tmp/nginx-conf/nginx.conf -g 'daemon off;' &
nginx_pid=$!

term() {
  kill "$node_pid" "$nginx_pid" 2>/dev/null || true
}
trap term TERM INT

while kill -0 "$node_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 1
done
term
wait || true
