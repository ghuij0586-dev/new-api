FROM node:22-alpine

RUN apk add --no-cache nginx poppler-utils unzip tini gettext \
  && mkdir -p /data/docs /var/log/nginx /tmp/nginx /usr/share/nginx/html

WORKDIR /opt/rongguang
COPY server /opt/rongguang/server
COPY public /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NEW_API_UPSTREAM=host.docker.internal:3000
ENV NEW_API_BASE=http://host.docker.internal:3000
ENV BFF_UPSTREAM=127.0.0.1:8081
ENV BFF_HOST=127.0.0.1
ENV BFF_PORT=8081
ENV DATA_DIR=/data

EXPOSE 80
VOLUME ["/data"]
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
