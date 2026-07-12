#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8089}"
FRONTEND_DIR="$ROOT/frontend"
DIST_DIR="$FRONTEND_DIR/dist"
BINARY="$ROOT/bin/server"

find_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return 0
  fi

  if [ -n "${NVM_DIR:-}" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    source "$NVM_DIR/nvm.sh"
    if command -v npm >/dev/null 2>&1; then
      command -v npm
      return 0
    fi
  fi

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh"
    if command -v npm >/dev/null 2>&1; then
      command -v npm
      return 0
    fi
  fi

  return 1
}

find_go() {
  local candidate
  for candidate in \
    "$(command -v go 2>/dev/null || true)" \
    /usr/local/go/bin/go \
    /usr/bin/go \
    "$HOME/go/bin/go" \
    /snap/bin/go; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

build_frontend() {
  local npm_bin
  npm_bin="$(find_npm)" || return 1

  echo "→ Сборка фронтенда..."
  cd "$FRONTEND_DIR"

  if [ ! -d node_modules ]; then
    echo "→ Установка npm-зависимостей..."
    "$npm_bin" install
  fi

  "$npm_bin" run build
}

build_server() {
  local go_bin
  go_bin="$(find_go)" || return 1

  echo "→ Сборка Go-сервера..."
  mkdir -p "$ROOT/bin"
  cd "$ROOT/backend"
  "$go_bin" build -o "$BINARY" .
}

ensure_dist() {
  [ -f "$DIST_DIR/index.html" ]
}

ensure_postgres() {
  export DATABASE_URL="${DATABASE_URL:-postgres://games:games@localhost:5432/games?sslmode=disable}"

  if command -v docker >/dev/null 2>&1 && [ -f "$ROOT/docker-compose.yml" ]; then
    if ! docker compose -f "$ROOT/docker-compose.yml" ps --status running 2>/dev/null | grep -q postgres; then
      echo "→ Запуск PostgreSQL (docker compose)..."
      docker compose -f "$ROOT/docker-compose.yml" up -d postgres
      sleep 2
    fi
  fi
}

run_server() {
  echo "→ Запуск сервера на порту ${PORT}"
  echo "   Локально:  http://localhost:${PORT}"
  if command -v hostname >/dev/null 2>&1; then
    local ip
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
    if [ -n "$ip" ]; then
      echo "   По сети:   http://${ip}:${PORT}"
    fi
  fi
  cd "$ROOT/backend"
  exec "$BINARY" -port "$PORT" -static "$DIST_DIR"
}

# --- фронтенд ---
if ensure_dist; then
  if find_npm >/dev/null 2>&1; then
    build_frontend
  else
    echo "⚠ npm не найден — пропускаю сборку, использую готовый frontend/dist/"
  fi
else
  if ! build_frontend; then
    echo ""
    echo "Ошибка: npm не найден и frontend/dist/ отсутствует."
    echo "Установите Node.js: https://nodejs.org/"
    exit 1
  fi
fi

# --- бэкенд ---
ensure_postgres

if find_go >/dev/null 2>&1; then
  build_server
  run_server
fi

if [ -x "$BINARY" ]; then
  echo "⚠ go не найден — запускаю готовый bin/server"
  run_server
fi

echo ""
echo "Ошибка: go не найден и bin/server отсутствует."
echo ""
echo "Установите Go на сервере:"
echo "  sudo snap install go --classic"
echo "  # или: sudo apt install golang-go"
echo "  # или: https://go.dev/dl/"
echo ""
echo "Либо соберите бинарник на другой машине и скопируйте:"
echo "  ./build-server.sh"
echo "  scp bin/server user@server:~/project/tower-defense/bin/"
exit 1
