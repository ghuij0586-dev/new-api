# 融光

融光是给内部同事用的入口，不是 New API 官方管理后台，也不包含 New API 的服务端代码。

模型渠道、令牌和额度仍然由已经在跑的 New API 管理。融光只负责登录、选模型和对话。厂商密钥不会出现在页面里，也不会写进这个仓库。

当前服务器：

- 融光：<http://43.110.30.115/>
- 管理后台（保持不变）：<http://43.110.30.115:3000>

不要把这个页面部署到 GitHub Pages。GitHub Pages 是 HTTPS，现在的网关是 HTTP，浏览器会拦截。融光需要和 New API 装在同一台服务器上。

## 同事怎么登录

1. 管理员先在 <http://43.110.30.115:3000> 打开 New API，进入「令牌」，为每位同事单独签发一把令牌。
2. 把令牌单独发给本人。令牌一般以 `sk-` 开头。
3. 同事打开 <http://43.110.30.115/>，在「登录融光」里粘贴令牌。
4. 令牌只保存在他自己的浏览器里，不会上传到这个代码仓库。

不要把阿里云、火山引擎、智谱、MiniMax 的厂商密钥发给同事，也不要粘贴到融光里。那些密钥只配置在 New API 后台。

公用电脑用完后，点右上角名字，选择「退出登录」。

同事如果用 Cherry Studio 或其他客户端，接口地址填 `http://43.110.30.115/v1`，密钥填同一把网关令牌。

## 部署到当前服务器

下面的命令在阿里云「命令助手」里用 root 执行。它只会新增一个叫 `gateway-portal` 的容器，用来提供 80 端口的网页，并把 `/v1/` 转给本机 3000 端口上已经在跑的 New API。

不会执行 `docker stop new-api`，也不会执行 `docker rm new-api`。

仓库是私有的。如果下面的 `git clone` 提示没有权限，先在 GitHub 做一个只读的 Personal Access Token，再使用第二段命令。那个令牌只用来下载代码，不是模型令牌。

```bash
cd /opt
git clone https://github.com/ghuij0586-dev/new-api.git gateway-portal
cd gateway-portal
bash scripts/up.sh
```

私有仓库拉取失败时：

```bash
cd /opt
git clone https://你的GitHub用户名:你的GitHub只读令牌@github.com/ghuij0586-dev/new-api.git gateway-portal
cd gateway-portal
bash scripts/up.sh
```

成功时，`docker ps` 里应同时看到 `new-api` 和 `gateway-portal`。脚本还会访问本机 `/healthz`，并访问 `/v1/models`。没有令牌时返回 401，这是正常的，说明网页已经能转到 New API。

然后用浏览器打开 <http://43.110.30.115/>。

如果服务器上没有 `docker compose`，在 `gateway-portal` 目录里改用：

```bash
docker build -t gateway-portal:local .
docker rm -f gateway-portal >/dev/null 2>&1 || true
docker run -d --name gateway-portal --restart always \
  --add-host=host.docker.internal:host-gateway \
  -p 80:80 \
  -e NEW_API_UPSTREAM=host.docker.internal:3000 \
  gateway-portal:local
```

这里的 `docker rm` 只针对 `gateway-portal`。不要把名字换成 `new-api`。

80 端口如果已经被占用，把 `docker-compose.yml` 里的 `"80:80"` 改成 `"8080:80"`，再执行一次 `bash scripts/up.sh`。同事改为打开 <http://43.110.30.115:8080/>。

## 更新

```bash
cd /opt/gateway-portal
bash scripts/update.sh
```

这会拉取最新代码并重新构建融光。`new-api` 容器保持原样。

## 页面里有什么

- 工作台：可用模型数量、这把令牌的已用额度、能力覆盖，以及请求路径。
- 智能体：看图问答、团队问答、写作与纪要、文生图、语音转写。
- 对话：模型列表来自 `/v1/models`，文字和看图走 `/v1/chat/completions`，生图走 `/v1/images/generations`。
- 语音转写走 `/v1/audio/transcriptions`。令牌里没有语音模型时，卡片会写「尚未接入」，不会编造转写文字。
- 成员与额度：只显示当前这把令牌。不会列出其他同事。
- 右上角设置里可以勾选「显示管理员入口」。勾选后多出渠道分组和一次手动连通性测试。这仍然不能修改渠道，也看不到厂商密钥。
- 左下角可以切换深色，选择会记在这台浏览器里。

直接双击打开网页文件时，可以在「连接设置」里填写 `http://43.110.30.115:3000`。浏览器可能因跨域拦截请求。正式使用请打开 80 端口上的融光，此时地址留空即可。

## 常见情况

令牌无效、过期或被禁用时，页面会提示重新到管理后台的「令牌」页复制。额度用完、模型没有渠道、请求太频繁，也会用中文写出原因。

融光打不开、或提示连不上后面的 New API 时，先看原来的容器是否还在：

```bash
docker ps --filter name=new-api
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/v1/models
```

3000 端口返回 401，说明 New API 还在。不要为了修复融光去重启它，除非确认是 New API 自己出了问题。

## 安全

这个仓库里没有令牌，也没有厂商密钥。`.env.example` 只写了转发地址。不要把 `sk-` 令牌写进文件再提交。

管理后台继续使用原来的地址：<http://43.110.30.115:3000>。
