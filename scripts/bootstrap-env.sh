#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "Missing .env.example" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created .env from .env.example"
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    node -e 'const crypto=require("crypto"); process.stdout.write(crypto.randomBytes(32).toString("hex"))'
  fi
}

set_kv() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    perl -0pi -e "s|^${key}=.*$|${key}=${value}|m" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_secret() {
  local key="$1"
  local current
  current="$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"

  if [[ -z "$current" || "$current" == *"change-me"* || "$current" == *"change-this"* || "$current" == *"replace-with"* || "$current" == *"docforge-dev-secret"* || "$current" == *"docforge-internal-token"* ]]; then
    set_kv "$key" "$(random_hex)"
    echo "Generated ${key}"
  fi
}

ensure_secret "JWT_SECRET"
ensure_secret "INTERNAL_API_TOKEN"

echo "Environment bootstrap complete: $ENV_FILE"
echo "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI manually before first OAuth login."
