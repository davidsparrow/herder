#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${GEMINI_API_KEY:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env.local"
  set +a
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gemini-compare.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"
export NODE_PATH="$ROOT_DIR/node_modules${NODE_PATH:+:$NODE_PATH}"

npx tsc \
  --pretty false \
  --target ES2022 \
  --module commonjs \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --types node \
  --outDir "$TMP_DIR" \
  scripts/run-gemini-comparison.ts \
  src/lib/gemini.ts \
  src/lib/types.ts

node "$TMP_DIR/scripts/run-gemini-comparison.js" "$@"