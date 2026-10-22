# 个人导航站

React + TypeScript 前端、Hono + Node.js 后端、SQLite 数据库，使用 Docker Compose 自托管。

生产环境只运行一个应用容器：同一 Node.js 进程提供 API 和前端静态文件，SQLite 不需要单独的数据库容器。

## 当前状态

- 已实现书签/分类管理、公开首页、管理员登录、私密分类、拼音搜索、主题、置顶、最近添加/访问、双视图、拖拽排序、元数据获取、HTML/JSON 导入导出，以及设置里的自助修改密码。
- 浏览器扩展仅预留接口，尚未启用。
- 本地类型检查、生产构建和 106 项自动化测试通过，主要浏览器交互已验收。
- 线上部署走 GitHub Actions 构建 → 腾讯云 TCR → 服务器 1Panel 计划任务拉取上线，流程见 [`deploy/README.md`](deploy/README.md)。

## 1. 服务器前提

在服务器上执行：

```bash
docker version
docker compose version
```

`docker version` 应同时显示 Client 和 Server；只显示 Client 或提示连接不到 daemon，说明 Docker 服务还没有启动。需要支持 `docker compose` 的 Compose 插件，本文不使用旧的 `docker-compose` 命令。

还需要：

- 能拉取 Docker Hub 的 Node 镜像、访问 Debian 软件源和 npm registry。
- 正式对外使用时，有域名、TLS 证书和 HTTPS 反向代理，例如宿主机 Nginx、宝塔或 1Panel 的网站反代。
- 正式部署通常只对外开放 80/443；应用的 3000 端口默认仅宿主机可访问。

服务器不需要另外安装 Node.js、npm、SQLite 或 GCC，这些由镜像构建处理。若当前用户无权访问 Docker，可以使用 `sudo docker ...`；本文不修改用户组或 Docker 全局配置。

## 2. 上传源码

### 在本机 Mac 执行

下面只打包源码，不携带本机数据库、登录账号、依赖或编译产物：

```bash
tar -C "/Users/cjy/Desktop/1" \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./data' \
  --exclude='./storage' \
  --exclude='./backups' \
  --exclude='./prototype' \
  --exclude='./.env' \
  --exclude='./.git' \
  -czf "/Users/cjy/Desktop/personal-navigation.tar.gz" .

scp "/Users/cjy/Desktop/personal-navigation.tar.gz" YOUR_USER@YOUR_SERVER:~/
```

将 `YOUR_USER`、`YOUR_SERVER` 替换为 SSH 用户和服务器地址。压缩包保留 `web/public` 中的内置壁纸，不能只上传 `server` 目录。

### 在服务器执行

以下用于首次部署；如果目标目录已经包含其他项目，请换一个空目录，不要直接覆盖。

```bash
sudo mkdir -p /opt/personal-navigation
sudo tar -xzf ~/personal-navigation.tar.gz -C /opt/personal-navigation
sudo chown -R "$(id -un):$(id -gn)" /opt/personal-navigation
cd /opt/personal-navigation
```

后续服务器命令均在这个目录执行。本文统一指定 Compose 项目名 `personal-navigation`，避免换目录后误用新的数据卷。

## 3. 配置环境变量

在服务器执行：

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

`openssl` 输出一个随机密码，把它保存到密码管理器，并填写到 `ADMIN_PASSWORD`。已有 `.env` 时不要重复执行 `cp` 覆盖配置。

正式 HTTPS 部署示例：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
APP_ORIGIN=https://nav.example.com
BIND_ADDRESS=127.0.0.1
APP_PORT=3000
SESSION_TTL_DAYS=30
COOKIE_SECURE=true
```

逐项说明：

- **`ADMIN_USERNAME`**：首次初始化的管理员用户名，默认 `admin`。仅创建一个管理员，不开放注册；已有数据库时修改它不会改变已有账号。
- **`ADMIN_PASSWORD`**：首次初始化密码，没有生产默认值。示例故意留空，必须填入至少 12 位强密码，不能使用 `admin` 或 `change-this-password`；留空会被 Compose 拒绝。已有数据库时修改此变量不会重置密码。
- **`APP_ORIGIN`**：浏览器实际访问的站点源，包含协议、域名和非默认端口，不带路径。将示例域名替换为自己的域名，不要填写容器地址；错误值会导致保存/登录等写请求被拒绝。留空时使用请求 Host 校验，但反向代理部署推荐明确填写。
- **`BIND_ADDRESS`**：宿主机监听地址，默认 `127.0.0.1`，仅供宿主机反代访问。改为 `0.0.0.0` 会对外暴露应用端口，需自行配置防火墙和 HTTPS，本文不推荐直接暴露。
- **`APP_PORT`**：宿主机映射端口，默认 `3000`，容器内部仍固定为 `3000`。端口被其他程序占用时可以修改，同时修改反代上游地址。
- **`SESSION_TTL_DAYS`**：登录有效期，默认 30 天。填写正整数；数值越大，丢失登录设备后的会话有效时间越长。
- **`COOKIE_SECURE`**：默认 `true`，登录 Cookie 仅通过 HTTPS 发送。正式部署保持 `true`；仅本文的本地 SSH 隧道测试使用 `false`，不要在公网 HTTP 下传输管理员密码。

`.env` 由 Docker Compose 读取，直接运行 `npm start` 不会自动加载它。不要把 `.env`、数据库或包含私密书签的备份提交到公共仓库。

## 4. 构建并启动

在服务器执行：

```bash
docker compose -p personal-navigation config --quiet
docker compose -p personal-navigation --progress=plain build
docker compose -p personal-navigation up -d
docker compose -p personal-navigation ps
```

命令作用：

1. `config --quiet` 检查配置格式和必填变量；它不会检查密码是否足够强，也不会证明容器能启动。
2. `build` 在服务器构建镜像，安装原生 SQLite 构建工具、npm 依赖，执行类型检查/测试并打包。初次构建比较耗时、耗内存；后续会利用缓存。
3. `up -d` 后台启动应用，不需要再运行 Vite 或单独启动后端。
4. `ps` 应显示服务 `navigation` 为运行状态，健康检查稍后显示 `healthy`。

查看日志和接口：

```bash
docker compose -p personal-navigation logs --tail=100 navigation
curl -f http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:3000/
```

- 健康接口应返回包含 `"ok":true` 的 JSON；首页应返回 HTTP 200。
- `curl` 成功只证明宿主机能访问应用，不代表 DNS、HTTPS 或管理员登录已经正常。
- 首次启动会创建示例分类/书签；管理员使用 `.env` 中填写的账号密码，不是本机开发环境的 `admin / admin`。

## 5. 配置 HTTPS 反向代理

### 已有宝塔、1Panel 或网站管理面板

创建网站，绑定真实域名、申请/安装证书，启用 HTTPS；反向代理目标填写：

```text
http://127.0.0.1:3000
```

这里的 HTTP 只用于宿主机内部转发，浏览器对外地址仍是 HTTPS。反代应保留浏览器请求的 Host，允许至少 12 MB 请求体用于书签导入。若修改了 `APP_PORT`，同步修改上游端口。

**这个地址仅适用于反代运行在宿主机上。** 如果 Nginx 本身在另一个容器里，`127.0.0.1` 指向 Nginx 容器，而不是应用；需要额外接入共同的 Docker 网络并使用应用服务名。本文的 Compose 没有配置容器化反代，不要直接套用该地址。

### 宿主机 Nginx 示例

先准备有效证书，再把下列配置放入自己站点的 Nginx 配置文件；不要覆盖现有其他网站配置。替换域名、证书路径和实际上游端口：

```nginx
server {
    listen 80;
    server_name nav.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name nav.example.com;

    ssl_certificate /etc/nginx/certs/nav.example.com/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/nav.example.com/privkey.pem;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $http_host;
    }
}
```

配置解释：

- **`listen 80` / `return 301`**：将 HTTP 跳转到 HTTPS，不在明文 HTTP 上提供登录页面；服务器需允许 80 端口访问。
- **`listen 443 ssl`**：在 443 端口提供 TLS；证书有效且防火墙放行后才能正常访问。
- **`server_name`**：绑定自己的域名，需与 DNS、证书及 `APP_ORIGIN` 对应；示例域名不能原样使用。
- **`ssl_certificate`**：完整证书链文件；路径不存在、证书过期或域名不匹配都会造成 HTTPS 失败。
- **`ssl_certificate_key`**：对应的私钥文件，不能公开或上传到仓库。
- **`client_max_body_size 12m`**：允许导入请求通过反代，避免 Nginx 默认限制先返回 413；应用自身仍限制请求大小和导入文件大小。
- **`location /`**：转发前端页面及 `/api`、`/storage` 路径，不只转发 API。
- **`proxy_pass`**：转发到宿主机本地应用端口；不能填写前端开发端口 5173。
- **`proxy_set_header Host $http_host`**：保留外部 Host，包含可能的非默认端口；不设置时代理可能改成上游 Host，导致同源检查不符合预期。

检查成功后再重新加载：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

上述重载命令适用于 systemd 管理的宿主机 Nginx；面板管理的 Nginx 使用面板提供的检查/重载功能。证书申请和安装方式取决于现有面板或系统，本文不自动改动它们。

浏览器访问自己的 HTTPS 域名，确认：

1. 未登录只看到公开书签，不出现私密分类。
2. 能使用部署账号登录管理台。
3. 添加临时书签后刷新仍存在；测试后删除它。
4. 退出登录后私密分类消失。

## 6. 没有域名时：用 SSH 隧道先测试

不用把 3000 端口开放到公网。先在**服务器** `.env` 中修改这三项，其他项目保持不变：

```dotenv
APP_ORIGIN=http://127.0.0.1:13000
BIND_ADDRESS=127.0.0.1
COOKIE_SECURE=false
```

- **`APP_ORIGIN`**：这里填写本机浏览器通过隧道访问的地址，端口是本机的 13000，不是服务器上游 3000。
- **`BIND_ADDRESS`**：仍只监听服务器本地，避免未经 TLS 保护的端口暴露到公网。
- **`COOKIE_SECURE`**：本机浏览器使用 HTTP，因此测试时设为 `false`；本机到服务器的链路由 SSH 加密。正式 HTTPS 部署时改回 `true`。

在服务器重新创建容器以应用环境变量：

```bash
docker compose -p personal-navigation up -d --force-recreate
```

在**本机**终端执行，并保持该终端连接：

```bash
ssh -N -L 13000:127.0.0.1:3000 YOUR_USER@YOUR_SERVER
```

本机浏览器打开 `http://127.0.0.1:13000`。若本机 13000 被占用，可以换端口，但要同步修改 `APP_ORIGIN` 和隧道左侧端口；若服务器 `APP_PORT` 不是 3000，则修改隧道最右侧端口。

完成正式 HTTPS 配置后，恢复正式站点的 `APP_ORIGIN` 和 `COOKIE_SECURE=true`，再执行 `up -d --force-recreate`。关闭隧道终端即可停止这条测试连接。

## 7. 数据持久化与备份

本文固定项目名后，数据存放在两个 Docker 命名卷：

| 数据卷 | 容器目录 | 内容 |
| --- | --- | --- |
| `personal-navigation_navigation-data` | `/app/data` | `nav.db`、SQLite WAL 文件、管理员、会话、设置和书签 |
| `personal-navigation_navigation-storage` | `/app/storage` | 存储目录及其中的资源文件 |

它们不是服务器项目目录下的 `data/` 和 `storage/`。首次部署不会读取本机开发数据库。

普通重启、重建镜像和 `docker compose down` 都不会删除命名卷。**不要执行 `docker compose down -v` 或清理这些数据卷，它们包含真实数据。** 更改 Compose 项目名会使用另外一套卷，看起来像数据丢失，但旧卷可能仍在。

### 页面备份

登录管理台后：

- **完整备份**：下载 JSON，包含书签字段、分类及站点设置，可重新导入；它不包含管理员密码/会话，也不包含存储目录文件。
- **导出浏览器格式**：下载 HTML，方便导回浏览器；HTML 不保留本站私密范围、标签、访问记录等完整字段。

JSON 导入时可选择同时恢复站点设置；已有相同 URL 会跳过，不会覆盖原书签。与现有分类同名但公开范围不同的导入会被拒绝，避免意外公开私密书签。

不要把私密书签 HTML 再公开上传，导出文件本身不会自动保护隐私。

### 服务器完整备份：短暂停机后复制

下面在服务器执行。停机后一起保存整个数据目录，避免只复制运行中的 `nav.db` 而漏掉 WAL 中的新写入：

```bash
cd /opt/personal-navigation
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "backups/$STAMP/data" "backups/$STAMP/storage"
chmod 700 backups "backups/$STAMP"

docker compose -p personal-navigation stop navigation

docker compose -p personal-navigation cp navigation:/app/data/. "backups/$STAMP/data/"
docker compose -p personal-navigation cp navigation:/app/storage/. "backups/$STAMP/storage/"
cp .env "backups/$STAMP/.env"
chmod 600 "backups/$STAMP/.env"

docker compose -p personal-navigation start navigation
```

- 停止的是应用服务，不是 Docker 服务；备份期间网站暂时不可访问，完成后 `start` 恢复。
- `cp` 可从已停止、但尚未删除的容器复制文件；这一步不要用 `down` 代替 `stop`。
- 保留整个 `data` 目录，不只保留单个数据库文件；同时保存资源和环境配置。
- `.env` 含明文密码，数据库含私密书签和密码哈希，备份目录要严格限制访问，并另存一份到自己控制的安全位置。
- 如果复制失败，先检查原因；无论是否成功，都应确认服务最终已经重新启动。

恢复前先备份当前实例并停止服务，推荐在新的空数据卷中验证恢复结果，再切换正式实例。不要在线覆盖数据库，也不要只替换 `nav.db` 而保留另一个版本的 WAL 文件。

## 8. 升级、重启与资源检查

升级前先备份，再上传新源码；保留原来的 `.env`、Compose 项目名和数据卷。

```bash
cd /opt/personal-navigation
docker compose -p personal-navigation --progress=plain build
docker compose -p personal-navigation up -d
docker compose -p personal-navigation ps
```

构建新镜像时旧容器可以继续服务；只有构建成功后才执行 `up -d` 更新。应用以后如果引入不兼容数据库变更，应先阅读对应迁移说明，不要假定所有版本都能直接降级。

日常命令：

```bash
docker compose -p personal-navigation restart navigation
docker compose -p personal-navigation logs -f --tail=100 navigation
docker stats --no-stream
```

- `restart` 只重启当前容器，不会应用新的 `.env`，修改环境变量后用 `up -d --force-recreate`。
- `logs -f` 实时查看日志，按 Ctrl+C 只停止查看，不会停止网站。
- `docker stats` 查看实际资源占用；镜像构建阶段的依赖安装/原生编译峰值与站点日常运行占用不同。

## 9. 常见问题

### 镜像拉取返回 403

这是镜像仓库或现有镜像加速器拒绝访问，不是站点管理员密码错误。先在服务器单独测试：

```bash
docker pull node:24-bookworm-slim
```

检查自己的镜像源、网络和代理设置，不要盲目配置不明来源的加速器。本文不会修改 Docker 全局镜像源。

### 卡在 `apt-get` 或 `npm ci`

构建依赖源可能下载缓慢或连接停滞。看日志确定具体卡在哪一步，不能把没有新输出理解为编译已经完成：

```bash
docker compose -p personal-navigation --progress=plain build
```

- `apt-get`：检查 Debian 软件源连通性，以及 Docker 构建环境的 DNS/代理。
- `npm ci`：检查 npm registry；`better-sqlite3` 可能需要下载预编译文件或进行原生编译。
- 宿主机能访问外网，不代表构建容器的网络设置正常；本文不保证已完成一次本机镜像构建。

### 日志提示生产环境密码无效

首次部署必须填写至少 12 位强密码。改好 `.env` 后重新创建容器；单纯 `restart` 不会载入新环境变量。

### 登录成功后仍回到访客状态

检查浏览器访问的是不是 HTTPS。`COOKIE_SECURE=true` 时，公网 HTTP 不会正常发送登录 Cookie；不要为了正式上线而关闭 Secure，应修复 HTTPS。SSH 隧道测试按第 6 节配置。

### 提示“请求来源不可信”

检查 `APP_ORIGIN` 是否和浏览器地址栏的协议、域名及端口一致，且没有路径。修改后重新创建容器，并确认反代保留 Host。

### 修改 `.env` 后密码没变

环境变量只负责首次创建管理员，不会覆盖 SQLite 中的现有密码。登录后可在 **设置 → 安全 → 修改密码** 里输入原密码自助修改；忘记密码时不要直接删数据卷，应先备份再做账号维护。

### 浏览器访问服务器 IP 的 3000 端口失败

默认绑定 `127.0.0.1`，这是预期的保护措施。通过正式 HTTPS 反代或 SSH 隧道访问，不需要向公网开放 3000。

### 元数据获取失败，但网址能在自己浏览器打开

元数据抓取由服务器发起，因此服务器也必须能访问目标网站。私网、回环、链路本地等地址会被主动拒绝；仍可以手动保存这类书签，只是不能让服务器自动抓取其元数据。
