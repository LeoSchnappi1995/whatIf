#!/usr/bin/env bash
# 本地构建（无平台依赖）
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
echo "[1/2] 构建服务端..."
npm run build:server
echo "[2/2] 构建前端..."
npm run build:client
echo "✅ 构建完成：dist/server + dist/client"
