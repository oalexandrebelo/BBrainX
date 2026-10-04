# BBrainX — GODMODCODE

**Local context, governed memory and verifiable handoffs across coding agents.**

[Português](README.md) · [Research dossier](docs/DOSSIER.md) · [Validation evidence](docs/validation/ci-report.json)

BBrainX 0.3 is a runnable developer preview, not a universal model gateway. It keeps project-scoped text indexes, checkpoints and approved memories on your machine; search ranks the declaration of a name above its usages and tests, and files changed after indexing are re-read before being served. Invokta exposes six typed MCP capabilities; React Flow explains their responsibilities and a local workbench invokes the same real domain operations.

## Start

Install Node 24 LTS and Git first.

```sh
git clone https://github.com/oalexandrebelo/BBrainX.git
cd BBrainX
npm run setup
npm run demo
npm start
```

Open `http://127.0.0.1:4317`. No model account, API key, GPU, Python or Docker is required for the core. macOS has an executable `Start-BBrainX.command` launcher. Setup uses the committed lockfile, disables dependency lifecycle scripts, runs tests and builds the UI; it does not install system packages or rewrite editor configuration.

## Connect a project

```sh
node bin/bbrainx.mjs init --project my-app --root /absolute/path/to/my-app
node bin/bbrainx.mjs index --project my-app
node bin/bbrainx.mjs config --project my-app --client codex
node bin/bbrainx.mjs config --project my-app --client claude
```

Review the generated TOML/JSON and add it according to the installed client's documentation. Native authentication and gateways remain unchanged. Clients without MCP can use the explicit JSON/Markdown outputs.

The MCP interface supports indexing, search, bounded bootstrap, checkpoint get/put and memory proposals. Approval/revocation are separate local CLI actions; they are not exposed to the MCP agent. This is a local OS-user trust boundary, not protection against another malicious process with the same user permissions.

## What is implemented

Persistent SQLite/FTS5 index; content-hash reuse; dirty-file verification for selected evidence; token-bounded context using `o200k_base`; expected-version checkpoints; idempotency; transactional event journal; explicit memory review; consistent backup; loopback HTTP with Host/Origin/CSRF checks; real MCP stdio integration tests; desktop/mobile browser checks.

## Limits

No background watcher, semantic LSP analysis, shared provider KV cache, remote multi-tenancy, model inference or arbitrary shell executor. Laya, LightRAG and desktop automation are optional research profiles, not active features. Payload token counts are not provider billing or universal tokenizer measurements. Data is local until your chosen harness sends it to a provider. Never synchronize the live SQLite database over a network filesystem.

CI evidence is attached to an exact revision and records native macOS, Windows and Linux tests plus a Chromium UI check. Protocol tests do not certify every IDE version or the maintainer's personal Mac. Synthetic retrieval timings are not task-quality or financial-savings claims.

Original code is MIT. Dependencies and Remotion media retain separate licenses. Contributions should be reproducible, small and evidence-backed. Product direction: Alexandre Belo (AB); implementation and research used AI assistance.
