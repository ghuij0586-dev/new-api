FROM nginx:1.27-alpine

# 只替换这一项，避免把 nginx 自己的 $host 等变量误替换掉。
ENV NEW_API_UPSTREAM=host.docker.internal:3000
ENV NGINX_ENVSUBST_FILTER=^NEW_API_UPSTREAM$

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY public/ /usr/share/nginx/html/

EXPOSE 80
