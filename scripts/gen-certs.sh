#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${CERT_DIR:-$ROOT/certs}"
CERT_FILE="${TLS_CERT:-$CERT_DIR/cert.pem}"
KEY_FILE="${TLS_KEY:-$CERT_DIR/key.pem}"
DAYS="${TLS_DAYS:-825}"
CN="${TLS_CN:-localhost}"

mkdir -p "$(dirname "$CERT_FILE")"

if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  echo "→ Сертификаты уже есть: $CERT_FILE"
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Ошибка: нужен openssl для генерации сертификатов"
  exit 1
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
SAN="DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"
if [ -n "${IP:-}" ]; then
  SAN="${SAN},IP:${IP}"
fi
if [ -n "${TLS_EXTRA_SAN:-}" ]; then
  SAN="${SAN},${TLS_EXTRA_SAN}"
fi

CONF="$(mktemp)"
trap 'rm -f "$CONF"' EXIT
cat > "$CONF" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = ${CN}
O = Games Local

[v3_req]
subjectAltName = ${SAN}
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

echo "→ Генерация self-signed TLS: $CERT_FILE"
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -days "$DAYS" \
  -config "$CONF"

chmod 600 "$KEY_FILE"
echo "✓ Готово. SAN: $SAN"
echo "  На ТВ/браузере один раз примите предупреждение о сертификате."
