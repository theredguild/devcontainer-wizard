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

> Already have v1 installed globally under the unscoped name? Either upgrade in place
> with `npm i -g devcontainer-wizard@latest`, or run `npm uninstall -g devcontainer-wizard`
> first — installing both packages globally fails with `EEXIST`, since they provide the
> same two binaries.

## Upgrading from v1

v1 generated a `devcontainer.json` for VS Code. v2 does not: it builds and runs
hardened containers directly, and every command is new. There is no automatic
migration — v1 configs are not read. Coming from a VS Code Dev Containers workflow?
`dcw attach` is the v2 equivalent — it wires up SSH and launches your editor
(VS Code, Cursor, Zed, Antigravity, …) against the running container. Pin
`@theredguild/devcontainer-wizard@1` if you still need the old wizard.

## Supported engines

| Engine | Platform | Notes |
| --- | --- | --- |
| Docker | all | Full capability + resource control. Linux MAC (AppArmor) only on Linux hosts — not enforced in the macOS VM |
| OrbStack | macOS | Docker-compatible; auto-preferred on macOS |
| Podman | all | Rootless; uid-mapped tmpfs auto-uses `--userns=keep-id` |
| Lima (nerdctl) | macOS/Linux | AppArmor/sysctl depend on the guest VM |
| Apple Containers | macOS 15+ (arm64) | VM-isolated. Applies `--cap-drop`; **drops** read-only rootfs, tmpfs options, no-new-privileges, AppArmor and seccomp. Does **not** enforce network isolation (`--profile airgapped` stays networked unless you pass `--strict`) |

`dcw engines` shows live availability + per-engine hardening trade-offs.

## Quick start

```sh
dcw create                 # interactive wizard (engine chosen first)
dcw build my-env           # build the image
dcw up my-env              # start a hardened container
dcw shell my-env           # zsh into it (lands in /workspace as the vscode user)
dcw attach my-env          # attach an SSH-remote editor (VS Code, Cursor, Zed, …)
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

`dcw create` is **hardened by default**: with neither `--profile` nor `--harden`, it applies the `development` profile. Pass `--profile none` when you explicitly want no hardening.

Pick a named profile (`--profile hardened`) or individual options (`--harden drop-caps --harden readonly-os`). Options map to engine-neutral effects, then to engine-correct flags.

Engines degrade in two distinct ways, and both matter:

- **dropped** — the engine can't express the option at all, so it is never applied.
- **unenforced** — the flag is passed and accepted, but the engine can't actually enforce it.

Either is a warning by default and a hard failure (exit 7) under `--strict`. `dcw up --json` reports `appliedFlags`, `warnings`, `dropped` and `unenforced`; `dcw create --up --json` and `dcw attach --json` return the same data as a `hardening` object. A result showing `"dropped": []` may still have unenforced controls — check both.

`--strict` also covers commands that enter an *already-running* container (`exec`, `shell`, `agent`, `attach`): they refuse rather than drop you into an environment weaker than you asked for.

> [!IMPORTANT]
> **AppArmor is not enforced on macOS.** Docker Desktop and OrbStack run containers inside a Linux VM whose daemon reports no AppArmor support — dcw probes this directly (`docker info` → `SecurityOptions`) rather than assuming it. The flag is still passed, so `apparmor` is reported as **`unenforced`**, not `dropped`. All four built-in profiles request it, so `--strict` fails closed on macOS for every one of them.

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
