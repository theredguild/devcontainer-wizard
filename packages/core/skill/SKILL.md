---
name: dcw
description: >-
  Use when the user wants to create, build, run, shell into, or manage a Web3
  dev/audit container environment with dcw (@theredguild/devcontainer-wizard).
  Triggers on mentions of "dcw", "devcontainer wizard", spinning up a hardened
  container for foundry/hardhat/slither/echidna/medusa etc., or driving dcw
  non-interactively from an agent. Covers the full command surface, flag
  vocabulary, security profiles, and canonical workflows.
---

# dcw — container environment wizard

`dcw` (`@theredguild/devcontainer-wizard`) is an **editor-agnostic, shell-first, AI-native** container
environment wizard for Web3 development and smart-contract auditing. It authors a dev
environment (interactively via an ink TUI, or fully from flags), builds a plain-Debian
image on whatever container engine is available, runs it **hardened**, and manages its
lifecycle.

It does **not** generate a `devcontainer.json`. It builds a plain image and runs a
hardened container you `shell` into. Hardening options are translated into engine-correct
`run` flags and degrade gracefully when an engine can't honor them.

Supported engines: Docker, OrbStack (macOS, auto-preferred), Podman (rootless), Lima
(nerdctl), Apple Containers (macOS 15+ arm64, VM-isolated). Run `dcw engines` for live
availability and per-engine hardening trade-offs.

## Agent rule of thumb

When driving dcw programmatically (not as an interactive human):

- Always pass **`--no-input`** so it never prompts, and **`--json`** for structured output.
- Use **`dcw schema`** first to discover the live option vocabulary (languages, frameworks,
  tools, profiles, hardening, engines) before composing flags — don't hardcode from memory.
- Add **`--strict`** when hardening must be guaranteed (fail instead of silently dropping).
- Exit codes are deterministic; errors carry a machine `code` field under `--json`.
- The interactive ink wizard only mounts on a real TTY when none of `--json`,
  `--no-input`, or `--yes` are set — so the JSON path never touches the TUI.

## Command reference

`[name]` is optional on lifecycle commands and defaults to the sole / `.dcw` environment.

| Command | Purpose | Key flags |
| --- | --- | --- |
| `dcw create` | Author an environment (wizard or flags) | see below |
| `dcw build [name]` | Build the container image | `--force`, `--platform <p>` |
| `dcw up [name]` | Build (if needed) + start a hardened container | `--rebuild`, `--workspace <dir>` |
| `dcw shell [name]` | Interactive zsh into the container (lands in `/workspace` as `vscode`) | — |
| `dcw attach [name]` | Attach an SSH-remote editor (Zed, VS Code, Cursor, Antigravity, …) | `--editor <id>`, `--port <n>`, `--print`, `--folder <dir>` |
| `dcw exec [name] -- <cmd>` | Run a command in the running container | trailing `-- <cmd>` |
| `dcw agent <type> [name]` | Spawn an AI coding agent (claude/codex/opencode) in the container | `-e`/`--env`, `--install` |
| `dcw ls` | List environments + live container status | — |
| `dcw stop [name]` | Stop the running container | — |
| `dcw rm [name]` | Remove the container (optionally the env) | `--purge` |
| `dcw logs [name]` | Show container logs | `-f`/`--follow`, `--tail <n>` |
| `dcw engines` | Engine availability + hardening trade-offs | — |
| `dcw schema` | JSON schema + full option vocabulary (always JSON) | — |
| `dcw --skill` / `dcw skill` | Print this skill file (SKILL.md) and exit | — |

### `dcw create` flags

All selection flags are **repeatable** (pass the flag multiple times):

- `--name <string>` — environment name (defaults to the current directory name)
- `--core-lang <v>` — core languages: `rust`, `python`, `go`, `node`
- `--lang <v>` — smart-contract languages: `solidity`, `vyper`
- `--framework <v>` — frameworks: `foundry`, `hardhat`, `ape`
- `--fuzz <v>` — fuzzing/testing: `echidna`, `medusa`, `halmos`, `ityfuzz`, `aderyn`
- `--sec <v>` — security tooling: `slither`, `mythril`, `crytic-compile`, `panoramix`,
  `slither-lsp`, `napalm-toolbox`, `semgrep`, `slitherin`, `heimdall`
- `--ai-agent <v>` — AI coding agents to bake in: `claude`, `codex`, `opencode` (all pull Node)
- `--profile <key>` — named security profile (see below)
- `--harden <key>` — manual hardening key, repeatable, **merged with** `--profile`
- `--git-url <url>` — clone this git repo into the image
- `--git-branch <ref>` — branch/tag to clone (requires `--git-url`)
- `--[no-]ssh` — bake an SSH server into the image for editor attach (`dcw attach`); **on by default**, use `--no-ssh` to omit
- `--build` — build the image after creating
- `--up` — build **and** start the container after creating
- `--force` — overwrite an existing environment that has the same name

Note: tools pull their own dependencies (e.g. `foundry` pulls Rust, `slither` pulls
Python), so you don't have to list a core language just to satisfy a tool.

### `dcw attach` — SSH-remote editors

Wires up SSH into the environment's container (starting it if needed) and launches an
SSH-remote editor against it — the v2 replacement for the v1 VS Code Dev Containers
workflow. Requires the image to have been created with `--ssh` (the default; `--no-ssh`
environments must be recreated, or rebuilt with ssh enabled, before `dcw attach` works).

```sh
dcw attach                      # default env; auto-detects an installed editor
dcw attach my-env --editor zed  # pick an editor: zed, vscode, cursor, antigravity, …
dcw attach my-env --print       # just print connection details, don't launch an editor
dcw attach my-env --port 2222   # publish a fixed TCP port instead of the default exec proxy
```

- Writes a managed `~/.ssh/config` block (host alias `dcw-<name>`) so any SSH-remote
  editor, or plain `ssh dcw-<name>`, connects the same way.
- Two connection modes: the default **exec proxy** (no published port) or **port** mode
  (`--port <n>`, `--port 0` to auto-allocate) with a listening sshd in the container.
- `--folder <dir>` sets the remote folder to open (default `/workspace`).

### `dcw exec`

Pass the command after `--`. The env name is optional:

```sh
dcw exec my-env -- forge --version
dcw exec -- ls -la            # uses the sole/.dcw environment
```

### `dcw agent` — AI coding agents in the container

Spawns `claude` (Anthropic Claude Code), `codex` (OpenAI Codex), or `opencode`
(multi-provider) interactively inside the running container. The agent must be baked in
(select it in the wizard or `dcw create --ai-agent <type>`) or added with `--install`.

```sh
dcw agent claude                      # default env; opens Claude Code in /workspace
dcw agent codex my-env -- --version   # forward args to the agent after `--`
dcw agent opencode --env GITHUB_TOKEN # forward extra host env vars by NAME (inline NAME=value is rejected: secrets must not hit argv)
dcw agent claude --install            # npm-install the agent on-demand if missing
```

- **API keys** are forwarded from the host automatically: `ANTHROPIC_API_KEY` for claude,
  `OPENAI_API_KEY` for codex, both for opencode. If none is set the agent falls back to its
  own login flow (a warning is printed).
- **Network:** agents need to reach their provider. On a `network-none`-hardened env
  `dcw agent` warns, and fails under `--strict`.
- Equivalent low-level form (no key auto-forwarding): `dcw exec <name> -- claude`.

## Global flags (every command)

- `--yes`, `-y` — assume yes / accept defaults; do not prompt
- `--no-input` — never prompt; non-zero exit if input is required
- `--engine <e>` — target engine: `auto` (default), `docker`, `podman`, `orbstack`,
  `apple-container`, `lima`. Also settable via `DCW_ENGINE` env var.
- `--strict` — fail if a requested hardening option can't be honored by the engine
- `--json` — machine-readable output

## Security profiles

Pass a profile with `--profile <key>`. Profiles expand to a set of hardening keys;
`--profile` and any `--harden` flags are merged.

| Key | Summary |
| --- | --- |
| `development` | Balanced security for daily development (default-ish). |
| `hardened` | Enhanced security for auditing/research. Packet-crafting tools won't work. |
| `airgapped` | Hardened + no network. Extensions/package managers won't work. |
| `paranoid` *(experimental)* | Max security: air-gapped + read-only, ephemeral. |
| `network-restricted-analysis` *(exp)* | Web/git/package installs, no packet crafting. |
| `ci-like-local-runner` *(exp)* | Mirrors CI locally with immutable FS. Cache writes don't persist. |
| `package-install-session` *(exp)* | Install packages while keeping guardrails. |
| `security-research-controlled-net` *(exp)* | API testing/collectors, no packet crafting. |

Individual hardening keys can also be set directly, e.g.
`--harden drop-caps --harden readonly-os` (keys include `readonly-os`,
`ephemeral-workspace`, `secure-tmp`, `drop-caps`, `no-new-privs`, `apparmor`,
`no-raw-packets`, `secure-dns`, `network-none`, `vscode-security`). Use `dcw schema`
for the authoritative list.

### Hardening behavior

If the chosen engine can't honor an option it is **dropped with a warning** — or, under
`--strict`, the command fails. `dcw up --json` reports `appliedFlags`, `warnings`, and
`dropped` so you can confirm what was actually applied.

## Canonical workflows

Interactive (human):

```sh
dcw create                 # interactive wizard (engine chosen first)
dcw build my-env           # build the image
dcw up my-env              # start a hardened container
dcw shell my-env           # zsh into it (lands in /workspace as the vscode user)
dcw attach my-env          # attach an SSH-remote editor (VS Code, Cursor, Zed, …)
dcw ls                     # list environments + live status
dcw stop my-env
dcw rm my-env --purge --yes
```

One-shot, non-interactive (agent-friendly):

```sh
dcw create --no-input --name audit \
  --core-lang rust --framework foundry --sec slither \
  --profile hardened --build --up --json
```

Inspect capabilities before composing flags:

```sh
dcw engines                # which engines are available + trade-offs
dcw schema                 # JSON schema + full option vocabulary
```

## Installing / refreshing this skill

The installed binary ships the authoritative copy of this file. `dcw --skill` prints it
to stdout (the CLI is the single source of truth, so re-run it after upgrading dcw):

```sh
mkdir -p ~/.claude/skills/dcw && dcw --skill > ~/.claude/skills/dcw/SKILL.md   # Claude Code (user)
mkdir -p .claude/skills/dcw   && dcw --skill > .claude/skills/dcw/SKILL.md     # Claude Code (project)
mkdir -p .agents/skills/dcw   && dcw --skill > .agents/skills/dcw/SKILL.md     # Codex / other agents
```

## State locations

Environments live under XDG paths:

- `~/.config/dcw/environments/<name>.json` — manifest (spec + resolved tools + image/container state)
- `~/.local/state/dcw/<name>/Containerfile` — generated build file

## Running from source (development)

Global install:

```sh
npm install -g @theredguild/devcontainer-wizard   # or: pnpm add -g @theredguild/devcontainer-wizard
```

From the repo (runs source via tsx — pass CLI args directly, **no** `--`
separator; pnpm forwards a literal `--` to oclif and it errors):

```sh
pnpm --filter @theredguild/devcontainer-wizard dev --help
pnpm --filter @theredguild/devcontainer-wizard dev schema
pnpm --filter @theredguild/devcontainer-wizard dev engines
pnpm --filter @theredguild/devcontainer-wizard build     # tsc → dist
pnpm --filter @theredguild/devcontainer-wizard test      # unit + wizard tests (no daemon)
pnpm --filter @theredguild/devcontainer-wizard test:e2e  # gated: drives a real container engine
```
