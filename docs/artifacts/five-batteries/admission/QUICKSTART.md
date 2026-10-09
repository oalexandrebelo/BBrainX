# Uso da nova admissão — opt-in, sem mudar a autenticação da IDE

Pré-requisitos: revisão candidata desta entrega, Node suportado pelo BBrainX, diretório de estado local. O núcleo atual continua funcionando sem usar estes comandos.

## 1. Declarar uma autoridade e um recurso

Use o mesmo `BBRAINX_HOME` para os consumidores. Cada recurso físico tem uma chave estável escolhida pelo host, não um novo nome por harness. Este exemplo usa um único grupo neural da estação e **valores de política, não memória medida**:

```sh
PHYSICAL_KEY="$(node --input-type=module -e "import {createHash} from 'node:crypto'; console.log(createHash('sha256').update('local-neural-budget-v1').digest('hex'))")"
node scripts/admission.mjs register --resource local-neural --physical-key "$PHYSICAL_KEY" --slots 1 --bytes 3221225472
node scripts/admission.mjs status
```

Registro repetido com a mesma política é idempotente. Outra política para o mesmo ID é conflito. Outro ID com a mesma chave física é conflito. SHA-256 aqui identifica a configuração; não descobre GPU nem autentica quem chama.

## 2. Consultar Laya já instalado com quota compartilhada

O perfil Laya deve ter sido instalado por decisão explícita do operador. O comando abaixo não instala, faz upgrade ou ativa provedor externo. Crie um arquivo `request.json` com uma solicitação real, por exemplo:

```json
{"states":["Investigar por que a sessão expira antes do prazo configurado."],"questions":{"triagem":{"type":"choice","instructions":"Qual atividade o estado pede?","criteria":{"investigar":"Ler evidências e diagnosticar","publicar":"Publicar mudança já aprovada"}}},"maxLen":1024}
```

```sh
node scripts/laya-shared.mjs --project meu-projeto --resource local-neural --reserve-bytes 2147483648 --file request.json
```

`--lane feature-a` acrescenta verificação de binding de uma lane já registrada. A resposta do modelo é consultiva. O comando aguarda limpeza do worker antes de informar seu resultado de encerramento. Um segundo consumidor encontra `SHARED_SLOT_LIMIT` enquanto o primeiro possui a vaga. Esse script não injeta contexto em IDEs nem cria nova ferramenta de autorização.

## 3. Usar a biblioteca sem carregar modelos

```js
import { createHash } from 'node:crypto';
import { SharedAdmission } from './src/shared-admission.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const ledger = new SharedAdmission(process.env.BBRAINX_HOME);
ledger.registerResource({id:'local-work',physicalKey:hash('local-work-v1'),slots:2,byteLimit:1048576});
const lease = ledger.acquire({resource:'local-work',scopeDigest:hash('host-bound-project'),requestDigest:hash('operation-manifest'),bytes:4096});
if (!lease.ok) throw new Error(lease.reason);
// Exemplo determinístico efetivamente concluído; não representa inferência.
const resultDigest = hash('completed local deterministic operation');
ledger.release(lease.handle,{expectedRevision:1,evidenceDigest:resultDigest});
ledger.close();
```

Não colocar `release` em um `finally` genérico de pedido remoto. Primeiro comprovar término. A evidência deve referenciar a execução real; o exemplo acima demonstra somente o contrato síncrono.

## 4. Recuperar um estado indeterminado

Inspecione o ledger. Identifique seu UUID, geração, revisão, recurso e causa. Confirme por mecanismo apropriado que a tarefa física terminou. A morte do cliente não basta para um servidor remoto.

Somente depois dessa confirmação, o operador pode usar `reconcile --ledger-id ... --generation ... --revision ... --evidence ... --confirm-resource-stopped`, conforme `node scripts/admission.mjs --help`. O digest deve referenciar seu registro de evidência. O CLI registra uma declaração explícita do operador e não finge inspecionar processo/PID/porta.

Nunca apagar o banco para esconder o bloqueio. Um banco recriado não conhece os direitos ainda ocupados do anterior.

## 5. Reproduzir as evidências

```sh
npm ci --ignore-scripts --no-fund
npm test
npm run build
node scripts/shared-admission-negative.mjs
node scripts/benchmark-shared-admission.mjs
```

As duas últimas ferramentas criam bancos e mutantes somente em pastas temporárias e publicam relatórios em `artifacts/shared-admission`. Não leem seu banco pessoal e não executam modelos. Testes de tipos opcionais: `tsc --strict --noEmit --module nodenext --target es2022 test/types/shared-admission.mts`. A rodada usou TypeScript 5.8.3 disponível no ambiente; ele não foi acrescentado às dependências do core.

Rollback de código: voltar à revisão anterior preserva `brain.sqlite` e o ledger. Desligar o novo perfil não autoriza ignorar workers ainda residentes. Antes de qualquer restauração de banco, pare participantes e comprove quiescência.

## Coletor e CI

`node scripts/verify-shared-admission.mjs` exige checkout rastreado limpo, executa toda a suíte e o build, registra contagens, SHA, ambiente e hashes antes/depois. Sua saída fica em `artifacts/shared-admission/verification`. É um recibo local, não assinatura do produtor. O workflow `shared-admission.yml` repete esse coletor nos três sistemas e executa controles negativos/benchmark no Linux; nesta entrega ele foi escrito, **não executado no GitHub**.
