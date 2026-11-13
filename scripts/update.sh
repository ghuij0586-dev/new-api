#!/usr/bin/env bash
# 拉取最新门户代码并重新构建。不会动 new-api 容器。
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
exec bash scripts/up.sh
