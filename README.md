# dcw — container environment wizard

An **editor-agnostic, shell-first** container environment wizard built on **oclif + ink**. It authors a Web3 dev environment (interactively or from flags), builds an image on whatever container engine you have, runs it **hardened**, and manages its lifecycle — for humans and agents alike.

As of v2 this tool does **not** generate `devcontainer.json`. It builds a plain-Debian image and runs a hardened container you `shell` into. Security hardening is translated into engine-correct `run` flags, degrading gracefully when an engine can't honor an option.

> [!IMPORTANT]
> Containers improve your workflow, but they are **not a fully secure sandbox**.
> If you need to run untrusted or suspicious code, use GitHub Codespaces, GitPod,
> or a similar remote setup — **never run it directly on your machine**.

## Install

```sh
npm i -g @theredguild/devcontainer-wizard   # or: pnpm add -g @theredguild/devcontainer-wizard
```

This installs two binaries — `dcw` and `devcontainer-wizard` — pointing at the same CLI.
Everything below uses `dcw`.

## Upgrading from v1

v1 generated a `devcontainer.json` for VS Code. v2 does not: it builds and runs
hardened containers directly, and every command is new. There is no automatic
migration — v1 configs are not read. Pin `@theredguild/devcontainer-wizard@1`
if you still need the old wizard.

## Supported engines

| Engine | Platform | Notes |
| --- | --- | --- |
| Docker | all | Full Linux MAC + capability + resource control |
| OrbStack | macOS | Docker-compatible; auto-preferred on macOS |
| Podman | all | Rootless; uid-mapped tmpfs auto-uses `--userns=keep-id` |
| Lima (nerdctl) | macOS/Linux | AppArmor/sysctl depend on the guest VM |
| Apple Containers | macOS 15+ (arm64) | VM-isolated; drops Linux cap/AppArmor/seccomp hardening |

`dcw engines` shows live availability + per-engine hardening trade-offs.

## Quick start

```sh
dcw create                 # interactive wizard (engine chosen first)
dcw build my-env           # build the image
dcw up my-env              # start a hardened container
dcw shell my-env           # zsh into it (lands in /workspace as the vscode user)
dcw agent claude my-env    # spawn an AI coding agent inside the container
dcw ls                     # list environments + live status
dcw stop my-env
dcw rm my-env --purge --yes
```

## AI coding agents

Bake an agent CLI into the image by selecting it in the wizard ("AI coding agents" step)
or via `--ai-agent`, then launch it inside the running container with `dcw agent`:

```sh
dcw create --name audit --framework foundry --ai-agent claude --build --up
dcw agent claude            # opens Claude Code in the container, in /workspace

dcw agent codex my-env -- --version       # forward args after `--`
dcw agent opencode --env GITHUB_TOKEN     # forward extra host env vars
dcw agent claude --install                # install on-demand if not baked in
```

Supported: `claude` (Anthropic Claude Code), `codex` (OpenAI Codex), `opencode`
(multi-provider). `dcw agent` forwards the matching provider key from your host —
`ANTHROPIC_API_KEY` for claude, `OPENAI_API_KEY` for codex, both for opencode (each agent
can also use its own login flow if no key is set). Agents need network: under `network-none`
hardening `dcw agent` warns (and fails under `--strict`).

One-shot, non-interactive (agent-friendly):

```sh
dcw create --no-input --name audit \
  --core-lang rust --framework foundry --sec slither \
  --profile hardened --build --up --json
```

## AI-native surface

- Every wizard step has a flag equivalent; `dcw create --no-input ...` never prompts.
- `--json` emits structured output and machine-readable errors (`{error:{code,message}}`) with deterministic exit codes. The streaming pass-through commands (`exec`, `shell`, `logs`, `agent`) have no JSON payload — they propagate the container's exit code and accept `--json` as a no-op.
- `--engine`, `--strict` (fail if hardening is dropped), `--yes`/`--no-input` are global.
- `dcw schema` dumps the JSON Schema of an environment spec plus the full option vocabulary (languages, frameworks, tools, profiles, hardening, engines) so agents can discover capabilities.
- `dcw --skill` (alias `dcw skill`) prints the bundled agent skill (`skill/SKILL.md`) — a concise guide teaching coding agents how to drive dcw. Install it once and refresh after upgrades:

  ```sh
  mkdir -p ~/.claude/skills/dcw && dcw --skill > ~/.claude/skills/dcw/SKILL.md
  ```

## Hardening

Pick a named profile (`--profile hardened`) or individual options (`--harden drop-caps --harden readonly-os`). Options map to engine-neutral effects, then to engine-correct flags. If the chosen engine can't honor an option it is **dropped with a warning** (or, under `--strict`, the command fails). `dcw up --json` reports `appliedFlags`, `warnings`, and `dropped`.

## State

Environments live under XDG paths:

- `~/.config/dcw/environments/<name>.json` — manifest (spec + resolved tools + image/container state)
- `~/.local/state/dcw/<name>/Containerfile` — generated build file

## Development

```sh
pnpm install
pnpm --filter @theredguild/devcontainer-wizard dev --help   # run from source (tsx)
pnpm --filter @theredguild/devcontainer-wizard build        # tsc → dist
pnpm --filter @theredguild/devcontainer-wizard test         # unit + wizard tests (no daemon required)
pnpm --filter @theredguild/devcontainer-wizard test:e2e     # gated: builds + drives a real engine
```

ESM-only (`type: module`, NodeNext) — relative imports use explicit `.js` extensions. The ink wizard is loaded only on a real TTY; the JSON / non-interactive path never touches React.

## How to contribute

This repo is a pnpm workspace:

- `packages/core` → `@theredguild/devcontainer-wizard` — the CLI
- `packages/wrapper` → `devcontainer-wizard` — thin alias that delegates to core
- `packages/desktop` → a Native SDK desktop shell (not published to npm)

Getting started:

- `pnpm install` at the repo root installs and links everything
- `pnpm --filter @theredguild/devcontainer-wizard dev --help` runs the CLI from
  source via tsx. Pass CLI args directly — **no** `--` separator, since pnpm
  forwards a literal `--` to oclif and it errors.
- `node packages/wrapper/bin.js --help` exercises the unscoped wrapper against
  your local core

Notes:

- Packages are published from GitHub Actions using npm Trusted Publishers, on
  `v*` tags. See [this article ↗](https://blog.theredguild.org/how-to-npm-and-avoid-getting-rekt/).
- The wrapper depends on core via `workspace:*`, so it always links your local
  build during development.
