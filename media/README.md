# Filme de apresentação BBrainX

Composição original em React/Remotion, 1280×720, 30 fps, 25 segundos. Sem áudio, fontes distribuídas ou imagens de terceiros. É uma explicação de produto, não uma gravação de execução real. Os três números da cena «Medido, não prometido» vêm de `docs/EVALUATION.md` e `docs/RELEASE_NOTES.md`.

```sh
cd media
npm ci --ignore-scripts
npm run render
```

O primeiro lockfile é gerado pelo workflow de mídia. Depois disso, use `npm ci`. Todas as dependências `remotion` e `@remotion/*` precisam ter a mesma versão.

**Licença própria do Remotion:** não é coberto pela licença MIT do BBrainX. A documentação oficial distingue licença gratuita para elegíveis e licença empresarial. Verifique o uso e o tamanho da organização: https://www.remotion.dev/docs/license/pricing . O núcleo funciona sem instalar este pacote.
