# c-nav 部署：GitHub Actions → 腾讯云 TCR → 服务器

流水线：`打 tag / 手动触发` → GitHub Actions 构建镜像 → 推送到腾讯云容器镜像服务（个人版）→ SSH 到服务器 `docker compose pull && up -d` → 健康检查。

```
GitHub repo ──(tag v*)──> Actions: docker build (linux/amd64)
                                   │ push
                                   ▼
                     ccr.ccs.tencentyun.com/cnav/c-nav:latest
                                              │  :sha-<7位>
                                   SSH deploy │
                                              ▼
                        服务器 /opt/c-nav → docker compose
                                              │
                                   OpenResty 反代 127.0.0.1:3000
                                              ▼
                              https://nav.deepthinkspace.cn
```

## 0. 前置：域名现在指到了别处 ⚠️

`nav.deepthinkspace.cn` 目前是 **CNAME 到 `nav-e1y.pages.dev`（Cloudflare Pages）**，不是这台服务器。上线前必须在 Cloudflare 改 DNS：

| 方案 | 设置 | 说明 |
|---|---|---|
| A（简单，推荐） | 删除 CNAME，加 `A nav → 124.220.193.225`，代理状态选**仅 DNS（灰云）** | 1Panel 直接申请 Let's Encrypt 证书，浏览器看到的是源站证书 |
| B（走 CF 代理） | 同上但选**已代理（橙云）**，SSL/TLS 模式设 **Full (strict)** | 源站需装 Cloudflare Origin Certificate（1Panel 可上传），否则 525/526 |

原 Pages 站点会在这个域名下失效，请先确认不再需要。

## 1. 把 CI 文件推进仓库

把本目录的上一级新增内容提交：

```bash
git add .github/workflows/docker-publish.yml deploy/
git commit -m "ci: build image to TCR and auto-deploy"
git push origin main
```

> `workflow_dispatch` 只有在 workflow 文件进入默认分支后才会出现。

## 2. 配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 值 |
|---|---|
| `TCR_USERNAME` | `100006066898`（主账号 UIN） |
| `TCR_PASSWORD` | TCR 个人版**实例密码**（控制台 → 实例管理 → 个人版 → 初始化/重置密码） |
| `SSH_HOST` | `124.220.193.225`（或之后指向服务器的域名） |
| `SSH_USER` | `root`（或你有 sudo + docker 权限的账号） |
| `SSH_KEY` | 服务器生成的部署私钥（见步骤 3 输出，含 `BEGIN/END` 两行） |
| `SSH_PORT` | 可选，默认 22 |

> TCR 个人版必须先建好命名空间 `cnav`，否则 push 会 401/403。

## 3. 服务器一次性初始化

1Panel → 主机 → 终端（或 SSH 登录）执行：

```bash
# 把 deploy/setup-server.sh 传到服务器后
bash setup-server.sh
```

脚本会：建 `/opt/c-nav`、写 `docker-compose.yml` + `.env`（生成 20 位管理员密码并打印）、`docker login`（输入 TCR 实例密码）、生成 SSH 部署密钥并把**私钥**打印出来给你粘到 GitHub、最后尝试 `pull && up -d`（TCR 里还没镜像时自动跳过，不影响前面步骤）。

> 首次 `pull` 时 TCR 里可能还没有镜像 —— 脚本已容错跳过，等第一次 Actions 跑完再 `docker compose up -d` 即可。
>
> 确认 GitHub 上的 `SSH_KEY` 填好后，可执行：`shred -u /root/.ssh/c-nav-deploy`。
>
> 若 `SSH_USER` 不是 root，请用该用户再执行一次 `docker login ccr.ccs.tencentyun.com -u 100006066898`（凭据按用户存），并确保它在 `docker` 组、对 `/opt/c-nav` 有写权限。

## 4. 触发构建

- 打 tag：`git tag v0.1.0 && git push origin v0.1.0`
- 或 Actions → Build & Deploy → Run workflow（`deploy` 勾上即构建完自动上线）

成功后 TCR 里会多出 `cnav/c-nav:latest` 和 `cnav/c-nav:sha-<7位>` 两个 tag。

## 5. 1Panel 反向代理 + HTTPS

网站 → 创建网站 → 域名 `nav.deepthinkspace.cn` → 反向代理 `http://127.0.0.1:3000` → 开启 HTTPS（Let's Encrypt）。

应用容器只监听 `127.0.0.1:3000`，不直接对外暴露。

## 6. 回滚

```bash
cd /opt/c-nav
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=sha-abc1234/' .env   # 换成上一个 tag
docker compose up -d
```

TCR 里的 `sha-*` tag 不可变，随时可回退。

## 常见问题

| 现象 | 处理 |
|---|---|
| Actions 里 `Login to Tencent TCR` 失败 | 检查 UIN / 实例密码；确认命名空间 `cnav` 已建；个人版实例需在**广州**初始化过 |
| runner 连不上 `ccr.ccs.tencentyun.com` | 境外 runner 偶发 DNS 抖动，重跑 job 即可 |
| push 超时 | 镜像约 300MB，正常 1–3 分钟；已内置一次重试 |
| 部署后 502 | `docker compose logs --tail=50`；多为 `ADMIN_PASSWORD` 为空或被 Compose 拒绝 |
| 登录后立刻掉线 | `APP_ORIGIN` 与浏览器地址不一致，或 `COOKIE_SECURE=true` 但走的是 http |
| 管理员密码 | 仅首次初始化写入数据库，重设需删卷：`docker compose down -v`（会清空书签数据，慎用） |
