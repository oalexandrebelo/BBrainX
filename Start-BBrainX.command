#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1; then
  printf '\nInstale Node 24 LTS e Git primeiro. Nenhuma alteração de sistema foi feita.\n'
  read -r -p 'Pressione Enter para fechar.' _
  exit 1
fi
npm run setup
npm run demo
node scripts/launch.mjs
