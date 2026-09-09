$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Target = Join-Path $Root "vendor\telegram-web-k"
$Repo = "https://github.com/TelegramOrg/Telegram-web-k.git"

if (Test-Path (Join-Path $Target ".git")) {
  git -C $Target pull --ff-only
} else {
  if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
  git clone $Repo $Target
}

Set-Location $Target
corepack enable
pnpm install
Write-Host "`nTelegram Web K fetched and dependencies installed."
Write-Host "Build: cd vendor/telegram-web-k; pnpm build"
