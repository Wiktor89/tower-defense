#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$ROOT/bin/server"

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

go_bin="$(find_go)" || {
  echo "Ошибка: go не найден."
  exit 1
}

echo "→ Сборка Go-сервера..."
mkdir -p "$ROOT/bin"
cd "$ROOT/backend"
"$go_bin" build -o "$BINARY" .
echo "✓ Готово: bin/server"
