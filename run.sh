#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8089}"

echo "→ Сборка фронтенда..."
cd "$ROOT/frontend"

if [ ! -d node_modules ]; then
  echo "→ Установка npm-зависимостей..."
  npm install
fi

npm run build

echo "→ Запуск Go-сервера на http://localhost:${PORT}"
cd "$ROOT/backend"
exec go run . -port "$PORT"
