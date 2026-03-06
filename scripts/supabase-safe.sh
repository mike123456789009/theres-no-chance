#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_ENV="$ROOT_DIR/.env"
CLI_ENV="$ROOT_DIR/.env.supabase.local"
BACKUP_ENV="$ROOT_DIR/.env.supabase-cli.backup"

TEMP_ENV_CREATED=0
ORIGINAL_ENV_MOVED=0

cleanup() {
  if [[ "$TEMP_ENV_CREATED" -eq 1 && -f "$DEFAULT_ENV" ]]; then
    rm -f "$DEFAULT_ENV"
  fi

  if [[ "$ORIGINAL_ENV_MOVED" -eq 1 && -f "$BACKUP_ENV" ]]; then
    mv "$BACKUP_ENV" "$DEFAULT_ENV"
  fi
}

trap cleanup EXIT

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is not installed or not available on PATH." >&2
  exit 127
fi

if [[ -e "$BACKUP_ENV" ]]; then
  echo "Refusing to run because a previous backup still exists at $BACKUP_ENV." >&2
  exit 1
fi

if [[ -f "$DEFAULT_ENV" ]]; then
  mv "$DEFAULT_ENV" "$BACKUP_ENV"
  ORIGINAL_ENV_MOVED=1
fi

if [[ -f "$CLI_ENV" ]]; then
  cp "$CLI_ENV" "$DEFAULT_ENV"
  TEMP_ENV_CREATED=1
fi

cd "$ROOT_DIR"
supabase "$@"
