#!/usr/bin/env bash
# 真 e2e：编译 → 启动服务 → 对 /v1/activate、/v1/heartbeat 发签名请求 → 验坏签名 401。
# 需要本地 postgres（docker: license-pg，端口 55432）。
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:55432/license?schema=public}"
export JWT_SECRET="${JWT_SECRET:-smoke-secret}"
export PORT="${PORT:-3009}"

npm run build >/dev/null

node dist/main.js > /tmp/lic-e2e-server.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do curl -s "localhost:$PORT" >/dev/null 2>&1 && break; sleep 0.5; done
node test/admin-smoke.mjs
node test/smoke.mjs
# SDK ↔ 服务端 全栈 e2e（确保 admin 存在 + SDK 已构建）
node dist/seed.js >/dev/null 2>&1 || true
( cd ../../packages/sdk && npm run build >/dev/null )
PORT="$PORT" node ../../packages/sdk/test/sdk-e2e.mjs
# 管理端新功能：账号/配额/编辑/批量/重置 secret/改密（seed 已建 admin）
PORT="$PORT" node test/admin-features.mjs
# 分销-产品白名单：可见性收窄、发码授权、连带隐藏、配额仍计入、客户端激活不受影响
PORT="$PORT" node test/admin-whitelist.mjs