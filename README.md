# DevContainer Wizard

A comprehensive CLI tool to set up fully equipped Web3 development containers. Features an interactive wizard for creating custom environments with advanced security hardening, git integration, and pre-configured toolchains, or quickly launch pre-built containers for common workflows.

![DevContainer Wizard](./assets/home.gif)

## Requirements

1. [Dev Containers CLI (`@devcontainers/cli`)](https://github.com/devcontainers/cli/) installed globally:

    ```bash
    pnpm add -g @devcontainers/cli
    ```

    ```bash
    npm i -g @devcontainers/cli
    ```

    ```bash
    yarn global add @devcontainers/cli
    ```

2. For use with [VS Code](https://code.visualstudio.com/) you need to install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers). We recommend reading the [Dev Containers documentation](https://code.visualstudio.com/docs/devcontainers/containers) for more information.

### Full requirements to run Dev Containers

- **Operating system**: Linux, macOS, or Windows 10/11. On Windows, **WSL2** is recommended for best performance.
- **Container runtime**: One of the following:
  - **Docker Desktop** (macOS/Windows) or **Docker Engine** (Linux) with the `docker` CLI available
  - Alternatively, **Podman 4+** with the `podman-docker` shim to provide a `docker`-compatible CLI
- **Docker Compose v2**: Available as `docker compose` (bundled with Docker Desktop; on Linux install the Compose plugin).
- **Git**: Version 2.x or later.
- **Node.js 18+** and a package manager (**pnpm**, **npm**, or **yarn**) to install `@devcontainers/cli` globally.
- **Editor**: **VS Code** with the **Dev Containers** extension, or use **GitHub Codespaces** as an alternative (no local runtime required).
- **Permissions**: Ability to run containers (e.g., membership in the `docker` group on Linux, or run with `sudo`).
- **Network access**: To pull base images and extensions on first run.

## Install

```bash
pnpm install -g devcontainer-wizard
```

```bash
npm install -g devcontainer-wizard
```

```bash
yarn global add devcontainer-wizard
```

## How to use

### Quick start

```bash
devcontainer-wizard start
```

- Select a pre-built container or create your own via the wizard.

### Create your own devcontainer

```bash
devcontainer-wizard create [NAME]
```

![DevContainer Wizard](./assets/create.gif)

The wizard will prompt you for:

- **Devcontainer name**: defaults to the current directory name.
- **Languages**: Solidity, Vyper.
- **Frameworks**: Foundry, Hardhat, Ape (ApeWorX).
- **Fuzzing & testing**: Echidna, Medusa, Halmos, Ityfuzz, Aderyn.
- **Security tooling**: Slither, Mythril, Crytic (crytic-compile), Panoramix, Semgrep, Heimdall.
- **System hardening**: Choose between predefined security recipes or manual configuration:
  - **Security Recipes**: Pre-configured security profiles for common use cases
  - **Manual Configuration**: Fine-grained control over individual security options
- **Git repository integration**: Automatically clone a repository during container build
  - Repository URL validation
  - Optional branch/tag specification
- **VS Code extensions**: Choose from curated extension collections or select your own.
- **Save path**: where `.devcontainer/<name>` will be created.

When finished, the CLI writes `Dockerfile` and `devcontainer.json` to `.devcontainer/<name>` and offers to start it immediately. It also prints the exact `devcontainer up` command you can run later.

#### Security Hardening Recipes

The wizard now includes predefined security recipes for common use cases:

- **Airgapped ephemeral sandbox**: Maximum isolation without network or persistence
- **Hardened online dev**: Day-to-day development with reduced attack surface
- **Source-review only**: Read code and run linters without repository writes
- **Training workshop lab**: Classroom use with predictable resource constraints
- **Network restricted analysis**: API access and package installs without packet crafting
- **CI-like local runner**: Mirrors CI behavior with immutable file system
- **Forensics reader**: Inspect artifacts offline without altering evidence
- **Package-install session**: Install packages while maintaining security guardrails
- **Net-disabled build test**: Prove builds work without network access
- **Security research with controlled net**: API testing without packet crafting capabilities

Each recipe automatically configures appropriate security hardening options based on the intended use case.

#### Manual Security Hardening Options

When choosing manual configuration, you have fine-grained control over:

**File System Security**:
- Read-only file system
- Secure temp directories (noexec, nosuid flags)

**Workspace Isolation**:
- Ephemeral workspace (tmpfs mount)

**Container Security**:
- Drop all capabilities
- No new privileges (prevents SUID/SGID escalation)
- AppArmor profile
- Seccomp filtering

**Network Configuration**:
- Enhanced DNS security (Cloudflare DNS)
- Complete network isolation
- Disable IPv6
- Disable raw packets (prevents packet crafting)

**Application Security**:
- VS Code security (disables auto-tasks, workspace trust, telemetry)

**Resource Limits**:
- Light (512MB, 2 cores)
- Standard (2GB, 4 cores)  
- Heavy (4GB, 8 cores)

#### Git Repository Integration

The wizard can now automatically clone a git repository during container build:

- **Repository URL**: Supports `https://`, `git@`, `ssh://`, and `git://` protocols
- **Branch/Tag Selection**: Optionally specify a specific branch or tag to clone
- **Validation**: Built-in URL validation ensures proper git repository format
- **Build-time Integration**: Repository is cloned into `/home/vscode/repos` during the image build and copied into `/workspace` on first start

This feature is particularly useful for:
- Setting up development environments with existing codebases
- Workshop environments with predefined project templates
- Audit environments with specific contract repositories

#### VS Code Extensions

The wizard offers curated extension collections:

- **Recommended** (default): Automatically installs Tintin's Ethereum Security Bundle
- **Custom selection**: Choose from organized collections:
  - **Tintin's Extensions**: Security-focused tools (Ethereum Security Bundle, EthOver, WeAudit, Inline Bookmarks, Solidity Language Tools, Graphviz Preview, Decompiler)
  - **Nomic Foundation**: Hardhat + Solidity integration
  - **Olympix**: AI-powered smart contract analysis

### Start pre-built containers

Prebuilt containers are stored in the [theredguild/devcontainer](https://github.com/theredguild/devcontainer) repository.

```bash
devcontainer-wizard prebuilt [CONTAINER]
```

![DevContainer Wizard](./assets/prebuilt.gif)

- **List available options**:

```bash
devcontainer-wizard prebuilt --list
# or
devcontainer-wizard prebuilt -l
```

- **Available containers**: `minimal`,  `auditor`, `minimal-legacy`, `theredguild-legacy`.
- You will be prompted how to open it (Terminal or VS Code).

#### GitHub Codespaces

You can also run prebuilt containers using GitHub Codespaces: 

[![Open in Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&template_repository=theredguild/devcontainer)

## Pre-built containers

- **Minimal**: Beginner-friendly environment.
- **Auditor**: Audit-ready environment with common security tooling.
- **Legacy The Red Guild**: The Red Guild's original devcontainer.
- **Legacy Minimal**: The Red Guild's original minimal devcontainer.
