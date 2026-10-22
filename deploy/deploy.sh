#!/usr/bin/env bash
# c-nav 服务器端部署脚本（拉取 TCR 上的镜像并重启）
#
# 用法：
#   bash /opt/c-nav/deploy.sh              # 拉取 latest，更新到最新构建
#   bash /opt/c-nav/deploy.sh sha-580e5a1  # 指定 tag（回滚 / 固定版本）
#
# 典型用法：1Panel → 计划任务 → 创建一个「Shell 脚本」任务，内容写
#   bash /opt/c-nav/deploy.sh
# 执行周期选「手动执行」（或留空），以后在面板上点「执行」即可上线。
#
# 设计要点：
#   * 幂等：镜像 ID 没变化时不会重启容器
#   * 健康检查：90 秒内等容器 healthy，失败自动回滚到上一版镜像
#   * 只在本机执行，不需要从外网 SSH 进来
set -Eeuo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/c-nav}"
SERVICE="${SERVICE:-navigation}"
TAG="${1:-latest}"
IMAGE="ccr.ccs.tencentyun.com/cnav/c-nav:${TAG}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

say "准备"
cd "$DEPLOY_DIR" 2>/dev/null || die "目录 $DEPLOY_DIR 不存在：先在服务器执行 setup-server.sh"
[ -f docker-compose.yml ] || die "缺少 $DEPLOY_DIR/docker-compose.yml"
[ -f .env ] || die "缺少 $DEPLOY_DIR/.env（管理员密码在里面）"
command -v docker >/dev/null || die "未安装 docker"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

APP_PORT="${APP_PORT:-3000}"
DOMAIN_HINT="${APP_ORIGIN:-http://127.0.0.1:${APP_PORT}}"
export IMAGE_TAG="$TAG"

echo "部署目录 : $DEPLOY_DIR"
echo "目标镜像 : $IMAGE"
OLD_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)
if [ -n "$OLD_ID" ]; then
  echo "本地现版本: ${OLD_ID:7:12}"
else
  echo "本地现版本: 无（首次拉取）"
fi

say "拉取镜像"
if ! docker compose pull; then
  die "拉取失败。若提示 unauthorized / denied，请先登录：
    docker login ccr.ccs.tencentyun.com -u ${TCR_USER:-<你的UIN>}
  若是网络问题，重试一次即可（容器走腾讯云内网到 TCR）。"
fi
NEW_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)
[ -n "$NEW_ID" ] || die "拉取后仍找不到镜像 $IMAGE"

say "更新容器"
docker compose up -d --remove-orphans

if [ -n "$OLD_ID" ] && [ "$OLD_ID" = "$NEW_ID" ]; then
  echo "镜像未变化（${NEW_ID:7:12}），容器保持不变"
fi

say "健康检查（最长 ${HEALTH_TIMEOUT}s）"
CID="$(docker compose ps -q "$SERVICE" 2>/dev/null || true)"
[ -n "$CID" ] || {
  docker compose logs --tail=50 || true
  die "容器没有启动起来，日志见上"
}

healthy=0
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  state="$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$CID" 2>/dev/null || echo unknown)"
  case "$state" in
    healthy|running) healthy=1; break ;;
    unhealthy|exited|dead)      break ;;
  esac
  sleep 3
done

if [ "$healthy" = "1" ]; then
  say "部署成功"
  docker compose ps
  echo
  echo "访问地址: ${DOMAIN_HINT}"
  echo "本地探测: http://127.0.0.1:${APP_PORT}/api/health"
  exit 0
fi

say "健康检查未通过，准备回滚"
docker compose logs --tail=60 || true

if [ -z "$OLD_ID" ]; then
  die "没有可回滚的旧镜像，请检查上面的日志"
fi

docker tag "$OLD_ID" "$IMAGE"
if docker compose up -d --force-recreate; then
  warn "已回滚到 ${OLD_ID:7:12}，线上仍是上一版；本次部署失败，请检查日志后再重试"
fi
exit 1
