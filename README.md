# dsh-cli-store

`dsh-cli-store` is a DeepSeek Harness plugin and a small command-line client for discovering, checking, and installing external CLI tools.

It is intentionally not another DSH plugin marketplace. A DSH marketplace installs DSH bundles; this store describes binaries that run outside the Harness, such as `gh`, `rg`, `jq`, and `ffmpeg`. The DSH bundle is the integration layer that makes the catalog available to the agent.

## Install into DSH

```bash
dsh plugin --profile web add https://github.com/Harzva/dsh-cli-store/releases/latest/download/dsh-cli-store-0.1.0.tgz
```

The plugin registers four tools:

- `dsh_cli_search` searches the checked-in catalog for the current platform.
- `dsh_cli_list` lists the complete catalog for the current platform.
- `dsh_cli_doctor` checks whether a catalogued CLI responds to its version flag.
- `dsh_cli_install` shows an install plan and can execute it only after explicit confirmation.

The package also exposes a local CLI:

```bash
dsh-cli-store search github
dsh-cli-store list --json
dsh-cli-store doctor gh
dsh-cli-store plan install gh
dsh-cli-store install gh --confirm --no-dry-run
```

The CLI accepts multi-word search queries and `--json` output for automation. A confirmed installation is followed by a version check; a package-manager success with no responding CLI is reported as `installed-unverified`.

## Safety model

- Registry entries and installer arguments are reviewed data, not shell snippets.
- Child processes use `shell: false`; arbitrary shell strings are never evaluated.
- Installers are restricted to the package-manager commands allowlisted by the code.
- Registry validation also restricts each manager to its install action (`brew install`, `winget install`, `cargo install`, `npm install`, or `pnpm add`).
- The DSH tool defaults to a dry-run and requires `confirm=true` plus `dryRun=false` for a write.
- Doctor only calls the declared CLI with its declared version arguments.
- Child-process output is capped while it is collected, and timed-out processes are terminated.

The initial registry supports Homebrew on macOS/Linux and winget on Windows. New entries should include a verified homepage, license, platform list, capabilities, and a concrete installer. Feishu integrations should be added only after the exact CLI or bridge contract is verified; a Node long-connection bridge is not silently presented as an official Feishu CLI.

## Development

```bash
pnpm check
pnpm run pack:dsh
pnpm run verify:dsh-offline
```

The offline verification creates an isolated temporary `DSH_HOME`, installs the freshly packed tarball into a temporary TUI profile, and checks the composed DSH configuration. It does not touch the user's normal DSH profile.

## Adding a CLI

Add one record to [`data/registry.json`](data/registry.json), add tests for platform selection and the installer command, then run the three commands above. Keep the record factual and prefer upstream package-manager documentation for installer metadata.

## License

MIT
