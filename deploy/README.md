# c-nav 部署：GitHub Actions 构建 → 腾讯云 TCR → 服务器拉取上线

```
GitHub repo ──(打 tag v*)──> Actions: docker build (linux/amd64)
                                   │ push
                                   ▼
                     ccr.ccs.tencentyun.com/cnav/c-nav:latest  (+ :sha-<7位>)
                                   │
                                   │ 服务器本机 docker compose pull（走腾讯云内网）
                                   ▼
                         /opt/c-nav → docker compose up -d
                                   │
                                   ▼
                        https://nav.deepthinkspace.cn
```

**职责划分：**

| 环节 | 谁做 | 说明 |
|---|---|---|
| 构建 + 推镜像 | GitHub Actions | 打 tag 自动触发，约 15–50 分钟（境外 runner 推广州较慢） |
| 上线 | 服务器自己 | 1Panel 计划任务点「执行」，或命令行 `docker compose pull && up -d` |

**为什么不用 SSH 部署：** GitHub runner 出口 IP 是 Azure 全球动态池，连着服务器时容易被腾讯云主机安全判定为异地/异常登录并拦截（本次部署就是这么失败的）。让服务器**主动拉**镜像，既不需要对外开放入站 SSH，也不受 runner 换 IP 影响，而且从腾讯云内网拉 TCR 速度更快。

---

## 1. 前置：域名指向 ⚠️

`nav.deepthinkspace.cn` 当前是 **CNAME 到 `nav-e1y.pages.dev`（Cloudflare Pages）**。上线前要在 Cloudflare 改：

| 方案 | 设置 | 说明 |
|---|---|---|
| A（简单，推荐） | 删掉 CNAME，加 `A nav → 124.220.193.225`，代理状态选**仅 DNS（灰云）** | 1Panel 直接申请 Let's Encrypt |
| B（走 CF 代理） | 同上但选**已代理（橙云）**，SSL/TLS 模式设 **Full (strict)** | 源站需装 Cloudflare Origin Certificate，否则 525/526 |

原 Pages 站点在这个域名下会失效，先确认不再需要。

## 2. 服务器一次性初始化

1Panel → 主机 → 终端（或 SSH 登录），以 root 执行：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/cjy1998/c-nav@main/deploy/setup-server.sh -o /tmp/setup-server.sh \
  && bash /tmp/setup-server.sh
```

（jsDelivr 不通就换 GitHub 原始地址：

```bash
curl -fsSL https://raw.githubusercontent.com/cjy1998/c-nav/main/deploy/setup-server.sh -o /tmp/setup-server.sh \
  && bash /tmp/setup-server.sh
```

)

脚本可重复执行：`docker-compose.yml`、`.env`、`deploy.sh` 已存在时会跳过，不会覆盖管理员密码。

它会：建 `/opt/c-nav`、写 `docker-compose.yml` 和 `.env`（生成 20 位管理员密码并打印）、安装 `deploy.sh`、`docker login` 腾讯云 TCR、最后尝试拉取并启动。

> **TCR 登录凭据会保存在 `/root/.docker/config.json`**，之后 `docker compose pull` 不需要再输密码。若某天报 `unauthorized`，重新执行一次 `docker login ccr.ccs.tencentyun.com -u 100006066898` 即可。

## 3. 日常部署：1Panel 计划任务点「执行」

1. 1Panel → **计划任务** → **创建计划任务**
2. 类型选 **Shell 脚本**
3. 任务名称：`c-nav 部署`
4. 执行周期：选 **手动执行**（若面板没有这个选项，随便填一个永不触发的时间，如 `0 0 31 2 *`）
5. 脚本内容：

```bash
bash /opt/c-nav/deploy.sh
```

6. 保存后，在列表里点 **执行** → 查看输出

`deploy.sh` 的行为：

- 拉取 `cnav/c-nav:latest`，镜像没变就**不重启**
- 等容器 `healthy`（最长 90 秒）
- 失败自动**回滚**到上一版镜像，并打印日志
- 成功启动后清理旧版本，本地只留最近 3 个（见第 7 节）

### 想全自动？把执行周期改成每 5 分钟

把上面第 4 步改成自定义 cron `*/5 * * * *`，之后推完 tag 等几分钟就会自动上线，连点都不用点。镜像没变化时脚本会直接跳过，不会反复重启。

## 4. 触发构建

```bash
git tag v0.1.0
git push origin v0.1.0
```

或 Actions → **Build & Push Image** → Run workflow。

成功后 TCR 里会多出 `cnav/c-nav:latest` 和 `cnav/c-nav:sha-<7位>`。

## 5. 反向代理 + HTTPS

1Panel → 网站 → 创建网站 → 域名 `nav.deepthinkspace.cn` → 反向代理到 `http://127.0.0.1:3000` → 开启 HTTPS（Let's Encrypt）。

应用只监听 `127.0.0.1:3000`，不直接对外暴露。

## 6. 回滚

```bash
bash /opt/c-nav/deploy.sh sha-abcd1234   # 换成上一个 tag
```

或临时改 `/opt/c-nav/.env` 里的 `IMAGE_TAG=sha-abcd1234` 再点一次「执行」。TCR 里的 `sha-*` tag 不可变，随时可回退。

## 7. 镜像保留：仓库和服务器各留 3 个

**服务器侧**由 `deploy.sh` 自动处理：每次部署给镜像打一个 `local-<时间戳>` 标签，启动成功后只保留最近 3 个版本（当前版 + 2 个可回滚的旧版），多余的标签连同悬空镜像一起删除。想改数量：

```bash
KEEP_VERSIONS=5 bash /opt/c-nav/deploy.sh    # 保留最近 5 个版本
```

**TCR 仓库侧**用控制台的一次性清理策略，不需要写脚本：

1. [容器镜像服务控制台](https://console.cloud.tencent.com/tcr) → **实例管理** → 广州的个人版实例 → **更多 → 设置镜像清理**
2. 勾选 **启用全局镜像生命周期管理**
3. **保留最新镜像版本** 填 `6`（每次构建产生 `latest` + `sha-xxxxxxx` 两个标签，6 个标签 ≈ 最近 3 次构建）
4. 确定

之后每次推送后 TCR 会自动清掉更老的标签，`latest` 始终指向最新构建，仓库不会无限增长。

`deploy.sh` 只在首次跑 `setup-server.sh` 时安装，之后升级它用这一行（不会动 `.env` 和容器）：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/cjy1998/c-nav@main/deploy/deploy.sh -o /opt/c-nav/deploy.sh && chmod 755 /opt/c-nav/deploy.sh
```

## 8. GitHub Secrets

只需要两个（部署相关的 `SSH_*` 已经不需要了，可以删掉）：

| Secret | 值 |
|---|---|
| `TCR_USERNAME` | `100006066898`（主账号 UIN） |
| `TCR_PASSWORD` | TCR 个人版**实例密码**（控制台 → 实例管理 → 初始化/重置密码） |

> 个人版必须先建好命名空间 `cnav`，否则 push 会 401/403。

## 常见问题

| 现象 | 处理 |
|---|---|
| Actions `Login to Tencent TCR` 失败 | 检查 UIN / 实例密码；确认命名空间 `cnav` 已建；个人版实例需在**广州**初始化过 |
| push 很慢（20–50 分钟） | 境外 runner 到广州的公网带宽限制，属正常；失败会自动重试一次 |
| `docker compose pull` 报 unauthorized | `docker login ccr.ccs.tencentyun.com -u 100006066898` 重新登录 |
| 部署后 502 | `cd /opt/c-nav && docker compose logs --tail=50`；多为 `ADMIN_PASSWORD` 为空或被 Compose 拒绝 |
| 登录后立刻掉线 | `APP_ORIGIN` 与浏览器地址不一致，或 `COOKIE_SECURE=true` 但走的是 http |
| 管理员密码 | 登录后 **设置 → 安全 → 修改密码**（需输入原密码）；忘记密码只能删卷重建：`docker compose down -v`（会清空书签数据，慎用） |
| 计划任务里跑 `bash /opt/c-nav/deploy.sh` 报找不到 | 先确认 `setup-server.sh` 跑过；或直接改成 `cd /opt/c-nav && docker compose pull && docker compose up -d` |
