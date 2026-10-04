# Third-party notices

The root MIT license covers original BBrainX code, documentation and assets, not third-party packages, publications or trademarks.

## Invokta (design model of the capability engine and of the MCP server)

Since 0.4.0 the capability engine (`src/capability.mjs`) and the MCP stdio server (`src/mcp.mjs`) are code written for this project, and no Invokta package is installed or distributed. They take Invokta 0.9 (https://github.com/vinilana/invokta) as the model for their contract and behaviour: the capability definition, the order between validation, access and deadline, the error codes and error messages, the mapping of capabilities to MCP tools and the portable tool names. Parts of that expression were adapted, so the complete notice below accompanies this repository and any copy or substantial portion of it. The official MCP SDK is a development dependency used only by the interoperability test.

```
MIT License

Copyright (c) 2026 Vini Lana

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Laya (optional profile)

The Laya profile is installed only by the explicit command `bbrainx laya install`. It downloads the `laya` package (Apache-2.0, https://github.com/NandhaKishorM/laya) and its dependencies from PyPI into an isolated environment, and the `multilingual` checkpoint (Apache-2.0 per its model card) from `convaiinnovations/laya` on Hugging Face at a pinned revision, verified by SHA-256. None of that code or of those weights is part of this repository or of its source distribution. `profiles/laya/worker.py` is original BBrainX code that calls the package.

## Everything else

React, React Flow, gpt-tokenizer, Zod and all installed packages retain their own licenses. The lockfile identifies exact versions and integrity hashes. The dependency inventory records the resolved graph; review package notices before redistribution.

Remotion uses separate licensing and eligibility terms: https://www.remotion.dev/docs/license/pricing . The optional media package is not a mandatory core dependency. The original composition contains no third-party photographs, audio, logo library or distributed font files.

System-design repositories are research references, not copied into an MIT corpus. ByteByteGo declares CC BY-NC-ND 4.0; the ashishps1 collection declares GPL-3.0; the arialdomartini question list declares GPL-2.0; the puncsky notes declare no license, which means all rights reserved. The blind evaluation cases under `test/fixtures/blind-*.cases` are original questions that only name file paths of mem0 (Apache-2.0) and plandex (MIT); no content of those repositories is included. AkitaOnRails articles and scientific publications retain their original rights. The analysis and tests in this repository are original; full articles and third-party diagrams were not republished.

LOGO-DESIGN-SKILL (MIT) informed a process of geometric simplicity, small-size legibility and avoiding look-alikes. Its gallery was not copied. B/X and the three alternatives under `public/brand/options/` are original provisional marks, not a trademark-clearance claim.

Optional shallow checkouts under vendor preserve upstream licenses and are excluded from source releases. Downloading source is not installing, executing or certifying an integration.

Product direction: Alexandre Belo (AB). Research and implementation used AI assistance. Names of OpenAI, Anthropic, Google, Codex, Claude Code, Antigravity and other tools identify interoperability targets and imply no endorsement.
