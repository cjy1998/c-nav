#!/usr/bin/env bash
# c-nav 服务器一次性初始化（在宿主机 root 下执行，1Panel 终端 / SSH 均可）
#   bash setup-server.sh
# 可覆盖的环境变量：
#   DEPLOY_DIR=/opt/c-nav  DOMAIN=nav.deepthinkspace.cn  APP_PORT=3000
set -euo pipefail

DEPLOY_DIR=${DEPLOY_DIR:-/opt/c-nav}
DOMAIN=${DOMAIN:-nav.deepthinkspace.cn}
APP_PORT=${APP_PORT:-3000}
TCR_USER=${TCR_USER:-100006066898}
REGISTRY=${REGISTRY:-ccr.ccs.tencentyun.com}

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

say "检查 docker"
command -v docker >/dev/null || { echo "未安装 docker，先在 1Panel 应用商店装好 Docker"; exit 1; }
docker compose version >/dev/null || { echo "缺少 docker compose 插件（v2）"; exit 1; }

say "检查端口 ${APP_PORT}"
if ss -lntp 2>/dev/null | grep -q ":${APP_PORT} "; then
  echo "端口 ${APP_PORT} 已被占用，请先设置 APP_PORT=其他端口 再重跑本脚本"
  ss -lntp | grep ":${APP_PORT} " || true
  exit 1
fi

say "创建部署目录 ${DEPLOY_DIR}"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

if [ ! -f docker-compose.yml ]; then
  cat > docker-compose.yml <<'YAML'
name: c-nav

services:
  navigation:
    image: ccr.ccs.tencentyun.com/cnav/c-nav:${IMAGE_TAG:-latest}
    init: true
    restart: unless-stopped
    ports:
      - "${BIND_ADDRESS:-127.0.0.1}:${APP_PORT:-3000}:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
      DATA_DIR: /app/data
      STORAGE_DIR: /app/storage
      ADMIN_USERNAME: ${ADMIN_USERNAME:-admin}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:?请在 .env 中设置至少 12 位管理员密码}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
      COOKIE_SECURE: ${COOKIE_SECURE:-true}
      APP_ORIGIN: ${APP_ORIGIN:-}
    volumes:
      - navigation-data:/app/data
      - navigation-storage:/app/storage
    read_only: true
    tmpfs:
      - /tmp:size=16m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"

volumes:
  navigation-data:
  navigation-storage:
YAML
  echo "已写入 docker-compose.yml"
else
  echo "docker-compose.yml 已存在，跳过"
fi

if [ ! -f .env ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)
  cat > .env <<EOF
IMAGE_TAG=latest
BIND_ADDRESS=127.0.0.1
APP_PORT=${APP_PORT}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_TTL_DAYS=30
COOKIE_SECURE=true
APP_ORIGIN=https://${DOMAIN}
EOF
  echo "已写入 .env"
  echo "-----------------------------------------------------"
  echo " 管理员账号: admin"
  echo " 管理员密码: ${ADMIN_PASSWORD}"
  echo " （首次启动时写入数据库，请立即保存）"
  echo "-----------------------------------------------------"
else
  echo ".env 已存在，跳过（如需重置密码见 README 的“管理员密码”）"
fi
chmod 600 .env

say "登录腾讯云镜像仓库"
echo "用户名 ${TCR_USER}，密码 = TCR 控制台『个人版实例 → 初始化密码/重置密码』设置的那个"
docker login "$REGISTRY" --username "$TCR_USER"

say "安装部署脚本 deploy.sh"
if [ -f "$(dirname "$0")/deploy.sh" ]; then
  install -m 755 "$(dirname "$0")/deploy.sh" "${DEPLOY_DIR}/deploy.sh"
  echo "已安装 ${DEPLOY_DIR}/deploy.sh"
elif [ -f "${DEPLOY_DIR}/deploy.sh" ]; then
  echo "已存在 ${DEPLOY_DIR}/deploy.sh"
else
  echo "未找到 deploy.sh，可稍后从仓库 deploy/deploy.sh 复制到 ${DEPLOY_DIR}/"
fi

echo "-----------------------------------------------------"
echo " 以后部署有两种方式（二选一，都在服务器本机执行）："
echo "   1) 1Panel → 计划任务 → Shell 脚本，内容：bash ${DEPLOY_DIR}/deploy.sh"
echo "      创建后点『执行』按钮即可上线，不需要从外网 SSH 进来"
echo "   2) 命令行：cd ${DEPLOY_DIR} && docker compose pull && docker compose up -d"
echo "-----------------------------------------------------"

say "拉取镜像并启动（TCR 里还没有镜像时这一步会失败，属正常）"
if docker compose pull; then
  docker compose up -d --remove-orphans
  sleep 3
  docker compose ps
  curl -fsS --retry 15 --retry-delay 3 --retry-connrefused "http://127.0.0.1:${APP_PORT}/api/health" && echo
else
  echo "跳过启动：镜像尚未推送。等第一次 GitHub Actions 跑完后再执行："
  echo "  cd ${DEPLOY_DIR} && docker compose pull && docker compose up -d"
fi

say "完成"
echo "下一步：1Panel → 网站 → 反向代理 ${DOMAIN} → http://127.0.0.1:${APP_PORT}，并申请 HTTPS"
