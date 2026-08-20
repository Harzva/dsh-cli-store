# dsh-cli-store

`dsh-cli-store` is a DeepSeek Harness plugin and a small command-line client for discovering, checking, and installing external CLI tools.

It is intentionally not another DSH plugin marketplace. A DSH marketplace installs DSH bundles; this store describes binaries that run outside the Harness, such as `gh`, `rg`, `jq`, and `ffmpeg`. The DSH bundle is the integration layer that makes the catalog available to the agent.

## Install into DSH

```bash
dsh plugin --profile web add https://github.com/Harzva/dsh-cli-store/releases/latest/download/dsh-cli-store-0.3.0.tgz
```

The plugin registers seven tools:

- `dsh_cli_search` searches the checked-in catalog for the current platform.
- `dsh_cli_list` lists the complete catalog for the current platform.
- `dsh_cli_discover` searches public CLI sources and can save results locally when explicitly requested.
- `dsh_cli_saved` reads locally saved discoveries without network access.
- `dsh_cli_install_discovered` can install only source-verified saved entries after confirmation; other discoveries stop at review-required.
- `dsh_cli_doctor` checks whether a catalogued CLI responds to its version flag.
- `dsh_cli_install` shows an install plan and can execute it only after explicit confirmation.

The package also exposes a local CLI:

```bash
dsh-cli-store search workbench
dsh-cli-store list --json
dsh-cli-store discover "image cli" --source github --limit 10 --save
dsh-cli-store saved image --json
dsh-cli-store install-discovered homebrew:ffmpeg --confirm --no-dry-run
dsh-cli-store doctor gh
dsh-cli-store plan install gh
dsh-cli-store install gh --confirm --no-dry-run
dsh-cli-store plan install workbench
```

The CLI accepts multi-word search queries and `--json` output for automation. A confirmed package-manager installation is followed by a version check; a package-manager success with no responding CLI is reported as `installed-unverified`. Manual official installers return instructions and leave execution to the user.

## Curated catalog

The registry currently contains 64 curated CLI entries. The catalog covers Alibaba Cloud, AWS, Azure, Kubernetes, Docker, Git, JavaScript/TypeScript, Python, databases, networking, media, document conversion, security, shell utilities, and terminal interfaces. The first expansion batch adds 59 Homebrew-backed entries for macOS and Linux; each record keeps its executable name, upstream homepage, license, capabilities, and explicit `brew install <formula>` plan.

## Internet discovery

`discover` currently queries four public sources through bounded adapters:

- npm public registry for JavaScript packages.
- GitHub repository search for repositories tagged with `cli`.
- Homebrew Formulae metadata for formulae that declare executables.
- crates.io for Rust packages.

“全网搜索”在工程上不是无边界爬取任意网页，而是通过可审计、可限流的公开来源适配器不断扩展覆盖面。每条结果保留来源、来源 ID、URL、版本和来源元数据；网络结果默认是 `unreviewed`，不会自动进入可执行安装清单。`--save` 只写入当前用户的本地发现目录，后续可用 `saved` 查看。Homebrew 和 crates.io 结果可以显示建议安装计划，但仍标记为需要审核。

## Safety model

- Registry entries and installer arguments are reviewed data, not shell snippets.
- Child processes use `shell: false`; arbitrary shell strings are never evaluated.
- Executable installers are restricted to the package-manager commands allowlisted by the code; manual official installers are documentation-only.
- Registry validation also restricts each manager to its install action (`brew install`, `winget install`, `cargo install`, `npm install`, or `pnpm add`).
- The DSH tool defaults to a dry-run and requires `confirm=true` plus `dryRun=false` for a write.
- Doctor only calls the declared CLI with its declared version arguments.
- Child-process output is capped while it is collected, and timed-out processes are terminated.
- Network discovery is read-only unless `save=true` / `--save` is explicitly requested.
- Discovery responses are treated as untrusted metadata and are rendered as data, not instructions.

The initial registry supports Homebrew on macOS/Linux and winget on Windows. Workbench CLI is included as an official manual installer because its upstream distribution is an OSS-hosted script/archive rather than a package-manager formula; the store displays the official instructions but never auto-executes a remote script. New entries should include a verified homepage, license, platform list, capabilities, and either a constrained package-manager installer or a documented manual installer. Feishu integrations should be added only after the exact CLI or bridge contract is verified; a Node long-connection bridge is not silently presented as an official Feishu CLI.

## Development

```bash
pnpm check
pnpm run pack:dsh
pnpm run verify:dsh-offline
```

The offline verification creates an isolated temporary `DSH_HOME`, installs the freshly packed tarball into a temporary TUI profile, and checks the composed DSH configuration. It does not touch the user's normal DSH profile.

## Adding a curated CLI

Add one record to [`data/registry.json`](data/registry.json), add tests for platform selection and the installer command, then run the three commands above. Keep the record factual and prefer upstream package-manager documentation for installer metadata.

Use discovery adapters for broad candidate collection. Promote an item into `data/registry.json` only after checking its upstream project, license, executable name, installer arguments, platform support, and installation behavior.

## License

MIT
