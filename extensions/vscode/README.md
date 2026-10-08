# BBrainX workspace extension (local preview)

Adds the BBrainX Activity Bar, a native workspace tree, status bar and commands for detection, connection and opening the local panel. Folder discovery uses the editor's `vscode.workspace.workspaceFolders` API. It does not parse window titles, scan your disk or inspect account settings.

Configure **BBrainX: Executable** in user/machine settings. The default `~/.local/bin/bbrainx` is a trusted launcher installed separately. To point directly at `bin/bbrainx.mjs`, also configure the absolute **Node Executable** path. Repository settings cannot select a program, Node runtime or panel endpoint.

- **Detectar workspace** produces a CLI integration plan for the selected open folder.
- **Conectar workspace** asks the CLI to register/configure that folder through `integrate --root ROOT --apply`. It modifies supported project MCP config files and keeps private backups. It does not approve workspace trust or claim a native MCP connection.
- **Iniciar painel local** starts the trusted CLI's `serve` command in a dedicated terminal with argv; it sends no shell text. The process stops when the terminal/extension closes.
- **Abrir painel** opens the configured HTTP loopback URL, default `http://127.0.0.1:4317`. Start the panel separately if it is not running. Remote extension hosts require explicit port forwarding; automatic remote opening is refused.

In a trusted workspace, opened file folders produce `workspace-seen` metadata receipts every 30 seconds under one extension session ID. This does not register/index a project or grant MCP access. Disabling **Activity Receipts** stops future heartbeats; receipts expire according to the CLI's retention policy. Closed folders stop receiving updates. Virtual/unsaved workspaces and untrusted workspaces do not launch processes.

The tree shows *folder detected*, *configuration applied* or a pending/manual state. Connection through each agent remains a separate native verification. Antigravity identifies itself through `vscode.env.appName`; local VSIX compatibility and MCP scope still require verification in its actual installed version. IDE 2.5.5 workspace MCP discovery is not certified; CLI reports a manual step and never registers all projects globally.

## Package and install

```sh
node scripts/package-extension.mjs --out /absolute/private/path/bbrainx-workspace.vsix
```

The repository packager uses Python 3 standard-library ZIP support, validates a fixed file allowlist and creates a local preview VSIX. It does not publish to a marketplace, sign the package or imply platform certification. Use the editor's **Extensions: Install from VSIX** command and select the generated artifact; reload the editor if requested.

Supported extension API baseline is VS Code 1.85. In remote VS Code, the extension and CLI execute on the workspace extension host; install/configure the launcher there. POSIX launchers need an executable bit. Windows uses a trusted executable or Node plus the `.mjs` entrypoint; `.cmd` shell wrappers are not run through an implicit shell.

Validation: `node --test test/extension.test.mjs` checks the real package manifest, JS syntax, brand provenance and VSIX archive. No mock editor or mocked MCP connection substitutes for a native activation test. Extension commands, trust transitions, folder receipts and statuses must still be exercised in the real editor before claiming that integration works.

Official references: [workspace API](https://code.visualstudio.com/api/references/vscode-api#workspace), [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust).
