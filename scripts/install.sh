#!/bin/bash
# BBrainX: instalação em uma linha (macOS). Baixa o kit desta release, confere o SHA-256 de cada arquivo e roda o INSTALAR.sh.
#
#   curl -fsSL https://github.com/oalexandrebelo/BBrainX/releases/download/v2.4.0-preview/install.sh | bash
#   curl -fsSL …/install.sh | bash -s -- /caminho/do/projeto --apply     # instala e já liga um projeto
#
# Os argumentos vão para o INSTALAR.sh (--apply, --vscode, --project, --skip-tests). Atualização troca a versão em uso
# (--switch); a anterior continua instalada. O kit baixado fica numa pasta temporária apagada no fim: nada sobra.
# Nada aqui pede senha nem altera configuração global de harness, trust ou aprovações.
set -euo pipefail

TAG="${BBRAINX_TAG:-v2.4.0-preview}"
BASE="${BBRAINX_KIT_BASE:-https://github.com/oalexandrebelo/BBrainX/releases/download/$TAG}"
say(){ printf '\033[1m%s\033[0m\n' "$1"; }
die(){ printf '\033[31m✘\033[0m %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "este instalador é para macOS. Windows e Linux: ainda não homologados."
command -v git >/dev/null 2>&1 || die "falta o Git. Instale com: xcode-select --install   (e rode esta linha de novo)"
command -v curl >/dev/null 2>&1 || die "falta o curl."
node_ok=0
for c in "${BBRAINX_NODE:-}" /opt/homebrew/opt/node@24/bin/node /opt/homebrew/opt/node/bin/node /usr/local/opt/node@24/bin/node "$(command -v node 2>/dev/null || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && "$c" -e 'const[a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=20)?0:1)' 2>/dev/null && { node_ok=1; break; }
done
[ "$node_ok" = 1 ] || die "falta o Node 22.20 ou mais novo (recomendado 24). Instale com: brew install node@24   (ou nodejs.org) e rode esta linha de novo."

KIT="$(mktemp -d "${TMPDIR:-/tmp}/bbrainx-kit.XXXXXX")"
trap 'rm -rf "$KIT"' EXIT
say "BBrainX $TAG: baixando o kit"
curl -fsSL "$BASE/kit-SHA256SUMS" -o "$KIT/SHA256SUMS" || die "não consegui baixar $BASE/kit-SHA256SUMS"
for file in REVISION BUNDLE_NAME $(awk '{print $2}' "$KIT/SHA256SUMS"); do
  case "$file" in */*|..*) die "nome de arquivo inesperado no kit: $file";; esac
  curl -fsSL "$BASE/$file" -o "$KIT/$file" || die "não consegui baixar $file"
done
(cd "$KIT" && shasum -a 256 -c SHA256SUMS >/dev/null) || die "SHA-256 do kit não confere; nada foi instalado."
printf '\033[32m✔\033[0m kit conferido (%s arquivos)\n' "$(wc -l < "$KIT/SHA256SUMS" | tr -d ' ')"
BBRAINX_KIT_EPHEMERAL=1 bash "$KIT/INSTALAR.sh" --switch "$@"
say "Pronto. Rode: bbx ch   (confere tudo e abre o manual integrador)"
