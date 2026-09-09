#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/vendor/telegram-web-k"
REPO="https://github.com/TelegramOrg/Telegram-web-k.git"

if [ -d "$TARGET/.git" ]; then
  git -C "$TARGET" pull --ff-only
else
  rm -rf "$TARGET"
  git clone "$REPO" "$TARGET"
fi

cd "$TARGET"
corepack enable || true
pnpm install
printf '\nTelegram Web K fetched and dependencies installed.\n'
printf 'Build: cd vendor/telegram-web-k && pnpm build\n'
