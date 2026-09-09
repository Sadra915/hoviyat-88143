# Telegram Web K integration

This directory is intentionally kept separate from HOVIYAT's application code.

The official Telegram Web K repository is:
https://github.com/TelegramOrg/Telegram-web-k

Telegram Web K is a full web client built with Solid.js + TypeScript + SCSS and is licensed under GPLv3.
It is not a drop-in JS/CSS stylesheet: it contains its own UI, MTProto client, storage, workers and build system.

To fetch the official source locally, run:

    ../scripts/fetch-telegram-web-k.sh

After fetching, the next integration step is to replace HOVIYAT's current UI entry layer with a HOVIYAT adapter,
while preserving HOVIYAT authentication/database/messaging services where compatible.

Do not remove HOVIYAT branding. Do not present the application as Telegram.
