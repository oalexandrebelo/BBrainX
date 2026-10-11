#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  printf '\nConfigure Node 24 LTS no PATH primeiro. Nenhuma alteração de sistema foi feita.\n'
  read -r -p 'Pressione Enter para fechar.' _
  exit 1
fi
# Abertura não instala pacotes, não cria demo e não executa testes.
# Instalação explícita: npm run setup
if ! node scripts/launch.mjs; then
  printf '\nConfira a mensagem acima. Instalação inicial: npm run setup.\n'
  read -r -p 'Pressione Enter para fechar.' _
  exit 1
fi
