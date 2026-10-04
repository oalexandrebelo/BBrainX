# BBrainX — GODMODCODE

**Local context, governed memory and verifiable handoffs across coding agents.**

[Português](README.md) · [Study map](docs/STUDY_MAP.md) · [Research dossier](docs/DOSSIER.md) · [Evaluation](docs/EVALUATION.md) · [Validation evidence](docs/validation/ci-report.json)

BBrainX runs on your machine and gives a coding agent what it needs to continue a task: the right excerpts of the repository, the checkpoint of the previous session and the memories you approved. It speaks MCP to Claude Code, Codex, Cursor, VS Code and Gemini CLI. The core uses no model, network, account, Docker or Python.

**0.4.0 is a developer preview.** Everything described here runs and is tested on every revision; what was not measured is stated as not measured. Most of the documentation is in Brazilian Portuguese.

## Start in three commands

Requirements: Node 24 LTS and Git. This phase focuses on macOS; Linux and Windows pass the same test suite.

```sh
git clone https://github.com/oalexandrebelo/BBrainX.git && cd BBrainX
npm run setup
node bin/bbrainx.mjs up --root /path/to/your/project
```

`setup` checks the host, installs exactly the lockfile without lifecycle scripts, runs the tests and builds the panel. `up` registers the folder, indexes it and prints the next step for each harness. `node bin/bbrainx.mjs doctor` reports the best scenario for this machine; it only observes, and never runs the tools it finds.

```sh
node bin/bbrainx.mjs config --project my-project --client claude   # or codex, cursor, vscode, gemini
```

The command **prints** the configuration. No BBrainX command edits harness configuration, credentials or approval settings. `npm start` opens the panel at http://127.0.0.1:4317.

To let the agent do the wiring itself, paste [docs/prompts/ACTIVATE.md](docs/prompts/ACTIVATE.md) into its session. Anyone taking over the project starts at [docs/HANDOFF.md](docs/HANDOFF.md). Both are in Brazilian Portuguese.

## What was measured

| Measure | 0.3 | 0.4 | How |
|---|---|---|---|
| Expected file among the first 10, natural-language question | 54% | **84%** | 79 blind questions written by another author who never saw the search engine, over two third-party repositories |
| Expected file in first place, same questions | 33% | **46%** | The 95% intervals overlap (24–44% and 35–57%); case by case, the rank improved in 40 and got worse in 7 |
| Definition of an identifier in first place | 12 of 12 | 12 of 12 | Labeled cases over this repository, used as a regression gate |
| Production packages in the lockfile | 121 | **25** | Own capability engine and MCP server |

These numbers measure the rank of the expected file, not accepted tasks or billed token savings. Method, intervals and reproduction commands are in [docs/EVALUATION.md](docs/EVALUATION.md).

## Six tools, one scope

`context_bootstrap`, `context_search`, `context_index`, `session_checkpoint`, `session_get` and `memory_propose`. The server is original code and speaks **both eras of MCP** in the same process: the current revision (2026-07-28, no handshake) and the earlier ones (with `initialize`). The official protocol client talks to it in the tests; that validates the protocol, not every version of every IDE.

The server only sees the project it was started with, runs no commands and approves no memory. Retrieved text is evidence, never instructions.

## Optional profile: Laya

[Laya](https://github.com/NandhaKishorM/laya) is a local decision model: it picks among options, scores or answers yes/no, and generates no text. BBrainX installs it only on your command (`node bin/bbrainx.mjs laya install`), in an isolated Python environment, with weights verified by SHA-256.

Measured on a MacBook M5 Pro through the GPU: 4 to 18 s to load, about 8 ms per short decision, 1.8 GB of RAM. **Without fine-tuning it ranks below the lexical path** on both decisions tested, so it **does not change the context pack**. It stays available for asking (`laya ask`) and for repeating the measurement (`node scripts/laya-bench.mjs`). No line of BBrainX calls JEV or any hosted service.

## Study map

Thirty-seven tools were studied. Each sits in one of five situations — core, activatable profile, technique only, reference, or out — with the reason, the evidence and what would change the verdict. The map is interactive in the panel and written out in [docs/STUDY_MAP.md](docs/STUDY_MAP.md).

## Limits

No continuous file watcher, language-server analysis, multi-host sync, own encryption, multi-tenant authentication, screen capture or shell execution. A call deadline does not interrupt synchronous work such as indexing. Do not place the live database on iCloud or a network disk. See the [security model](docs/SECURITY_MODEL.md).

## Brand

The mark in use is the **BX monogram**, a provisional choice among three original options that are still under study. See [docs/BRAND.md](docs/BRAND.md).

<p align="center"><img src="public/brand/options/opcoes.gif" width="480" alt="The three BBrainX brand options cycling: A, two layers; B, faceted; C, BX monogram, in use"/></p>

## License

Original BBrainX code is MIT. The engine contract follows Invokta, whose full MIT notice is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The Laya profile and Remotion keep their own terms and are not part of the core. Project by Alexandre Belo (AB), built with AI assistance and evidence-driven review; no endorsement by OpenAI, Anthropic, Google or the studied projects is implied.
