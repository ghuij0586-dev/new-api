# 融光

融光是给内部同事用的办公入口，不是 New API 官方管理后台，也不包含 New API 的服务端代码。

同事用 New API 里已有的用户名和密码登录。登录之后，浏览器只保存融光自己的会话，看不到、也拿不到项目钥匙。每个项目在服务器上单独签发一把钥匙，页面上只显示项目名称。

模型渠道、额度和用户仍然由已经在跑的 New API 管理。厂商密钥不会出现在页面里，也不会写进这个仓库。

当前服务器：

- 融光：<http://43.110.30.115/>
- 管理后台（保持不变）：<http://43.110.30.115:3000>

不要把这个页面部署到 GitHub Pages。GitHub Pages 是 HTTPS，现在的网关是 HTTP，浏览器会拦截。融光需要和 New API 装在同一台服务器上。这一版不加 HTTPS。

## 管理员怎么准备第一个试用账号

1. 打开 <http://43.110.30.115:3000>，用管理员账号进入 New API。
2. 在系统设置里关闭公开注册。不要让同事自己注册。
3. 打开「用户管理」，新增一个用户，填写用户名和密码，状态设为启用。
4. 不要把厂商密钥交给同事。同事登录融光时只使用这个用户名和密码。

## 同事怎么用

1. 打开 <http://43.110.30.115/>。左边是「用账号进入工作台」，右边卡片标题是「登录融光」。
2. 填写用户名和密码，点「进入融光」。密码错误、账号未启用或网络失败时，错误留在这张卡片上。
3. 如果还没有项目，在工作台填写项目名称并创建。只需要名字。创建成功后，服务器会为这个项目单独签发一把钥匙，钥匙不会出现在页面上。
4. 只有一个项目时会自动选中。有多个项目时，要先选一个，才能写作、整理纪要或做项目问答。
5. 进入「项目问答」，上传 txt、md、pdf 或 docx。问资料里有的内容时，回答会写出来源文件名和摘录。问资料里没有的内容时，会说「根据当前项目资料，我不知道」。
6. 顶栏或智能体页的「澄账」查询当前项目的剩余额度、已用额度，以及输入、输出、缓存 token。记录不完整时会说明数字可能偏少。
7. 对话默认只存在这台浏览器里。设置里可以「导出对话」。退出登录不会把钥匙写回浏览器，本机的对话记录仍留在这台浏览器，下次用同一个账号登录还能看到。

页面底部和输入框附近都有这句话：对话记录默认只保存在这台浏览器，可导出到本地。但只要向模型提问，内容仍会经过网关，离开这台电脑。

## 验收清单

1. 用用户名和密码可以登录。页面上、以及浏览器收到的响应里，都看不到项目钥匙或 `sk-`。
2. 可以选择已有项目，或只填名字创建一个新项目。
3. 项目问答：问题能在资料里找到时，回答注明文件名；资料里没有的问题，明确说不知道。
4. 澄账按当前项目说明剩余额度、已用额度，以及输入、输出、缓存 token。缓存字段缺失或记录不完整时，说明数字可能偏少。

## 部署到当前服务器

下面的命令在阿里云「命令助手」里用 root 执行。它只会新增或更新叫 `gateway-portal` 的容器，用来提供 80 端口的网页和融光自己的接口，并把外部客户端的 `/v1/` 转给本机 3000 端口上已经在跑的 New API。

不会执行 `docker stop new-api`，也不会执行 `docker rm new-api`。

项目、资料和登录会话放在数据卷 `rongguang-data`。更新时不要删除这个数据卷。

仓库是私有的。如果 `git clone` 提示没有权限，先在 GitHub 做一个只读的 Personal Access Token，再使用第二段命令。那个令牌只用来下载代码，不是模型钥匙。

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

成功时，`docker ps` 里应同时看到 `new-api` 和 `gateway-portal`。脚本会访问本机 `/healthz` 和 `/api/rg/health`，并访问 `/v1/models`。没有令牌时 `/v1/models` 返回 401，这是正常的，说明外部接口已经能转到 New API。

然后用浏览器打开 <http://43.110.30.115/>。

如果服务器上没有 `docker compose`，在 `gateway-portal` 目录里改用：

```bash
docker build -t gateway-portal:local .
docker rm -f gateway-portal >/dev/null 2>&1 || true
docker run -d --name gateway-portal --restart always \
  --add-host=host.docker.internal:host-gateway \
  -p 80:80 \
  -e NEW_API_UPSTREAM=host.docker.internal:3000 \
  -e NEW_API_BASE=http://host.docker.internal:3000 \
  -v gateway-portal-data:/data \
  gateway-portal:local
```

这里的 `docker rm` 只针对 `gateway-portal`。不要把名字换成 `new-api`。`SESSION_SECRET` 可以不填，首次启动会写进数据卷。

80 端口如果已经被占用，把 `docker-compose.yml` 里的 `"80:80"` 改成 `"8080:80"`，再执行一次 `bash scripts/up.sh`。同事改为打开 <http://43.110.30.115:8080/>。

## 更新

```bash
cd /opt/gateway-portal
bash scripts/update.sh
```

这会拉取最新代码并重新构建融光。`new-api` 容器保持原样，数据卷也保留。

## 页面里有什么

- 工作台：选择或创建项目，然后进入写作、纪要、项目问答。
- 智能体：澄账，以及看图、对话、文生图、语音转写。这些调用都记在当前项目上。
- 澄账从智能体页的头像，或顶栏里的小头像进入。它查询当前项目的额度，不调用对话模型。金额按网关默认换算，500000 额度点约等于 1 美元；如果管理员改过比例，回答里会写明以管理后台为准。
- 设置里可以改称呼、导出对话、退出登录。没有更换令牌、API 根地址或管理后台地址。
- 渠道和成员额度不在日常导航里。用量看澄账。

## 常见情况

用户名或密码不对、账号被停用、暂时连不上网关，登录卡片会直接说明原因。

项目问答找不到依据时，不会用模型的一般知识编答案。

融光打不开、或提示连不上后面的 New API 时，先看原来的容器是否还在：

```bash
docker ps --filter name=new-api
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/v1/models
```

3000 端口返回 401，说明 New API 还在。不要为了修复融光去重启它，除非确认是 New API 自己出了问题。

## 安全

这个仓库里没有令牌，也没有厂商密钥，也没有同事密码。`.env.example` 只写了转发地址和会话密钥的名字。不要把 `sk-`、密码或 `SESSION_SECRET` 写进文件再提交。

管理后台继续使用原来的地址：<http://43.110.30.115:3000>。
