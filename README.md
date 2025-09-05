# DevContainer Wizard

A comprehensive CLI tool to set up fully equipped Web3 development containers. Features an interactive wizard for creating custom environments with advanced security hardening, git integration, and pre-configured toolchains, or quickly launch pre-built containers for common workflows.

![DevContainer Wizard](./assets/main.gif)

## Requirements

1. **Node.js 18+** and a package manager (**pnpm**, **npm**, or **yarn**) for installing the CLI.

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

To install our pre-realease clone this repo and run:

```bash
pnpm install
pnpm build
pnpm link
```

## How to use

### Quick start

```bash
devcontainer-wizard
```

### Create your own devcontainer

![DevContainer Wizard](./assets/create.gif)

```bash
devcontainer-wizard create --name <name>
```

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

The wizard includes predefined security profiles copied from prebuilt devcontainers, so you can build your own container with custom tools and a tested security profile:

- **Development**: Balanced security for daily development work
  - *Use cases*: Building dApps, writing smart contracts, testing with frameworks like Hardhat/Foundry
  - *Features*: Secure temp directories, no privilege escalation, AppArmor, secure DNS, VS Code security

- **Hardened**: Enhanced security for smart contract auditing and security research
  - *Use cases*: Code audits, security analysis, penetration testing, vulnerability research
  - *Features*: Ephemeral workspace, dropped capabilities, no raw packets, network restrictions, enhanced isolation

- **Isolated**: Maximum security with air-gapped environment
  - *Use cases*: Analyzing malware, handling sensitive data, forensic analysis, air-gapped development
  - *Features*: Read-only filesystem, complete network isolation, ephemeral workspace, maximum capability restrictions

Experimental profiles:

- **Network Restricted Analysis**: API access and package installs without packet crafting
- **CI-like Local Runner**: Mirrors CI behavior with immutable file system
- **Package Install Session**: Install packages while maintaining security guardrails
- **Security Research (Controlled Net)**: API testing without packet crafting capabilities

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

![DevContainer Wizard](./assets/prebuilt.gif)

Prebuilt containers are stored in the [theredguild/devcontainer](https://github.com/theredguild/devcontainer) repository.

- **Start a pre-built container**:

```bash
devcontainer-wizard prebuilt --name <name>
```

- **List available pre-built containers**:

```bash
devcontainer-wizard prebuilt --list
```

- **Available pre-built containers**: `minimal`,  `auditor`, `hardened`, `isolated`, `legacy`.
- You will be prompted how to open it (Terminal, VS Code, or Cursor).

#### GitHub Codespaces

You can also run prebuilt containers using GitHub Codespaces: 

[![Open in Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&template_repository=theredguild/devcontainer)

## Pre-built containers

- **Minimal**: Use Hardhat and Foundry doing zero config.
- **Auditor**: Audit smart contracts.
- **Isolated**: Run untrusted code.
- **Air-gapped**: Air-gapped environment.
- **ETH Security Toolbox**: Auditor environment with Trail of Bits selected tools.
- **Legacy**: The Red Guild's original devcontainer.

## How to contribute

### Wizard

We welcome contributions! To get started:

1. **Fork this repository** and clone it to your machine.
2. **Install dependencies**:
   ```bash
   pnpm install
   ```
3. **Make your changes** in a new branch.
4. **Test your changes** locally.
5. **Commit and push** your branch.
6. **Open a pull request** with a clear description of your changes.

For major changes, please open an issue first to discuss what you would like to change.

**Tips:**
- Follow the existing code style and structure.
- Keep documentation concise and up to date.
- If adding a new color or symbol, update `src/ui/styling/colors.ts` or `src/ui/styling/symbols.ts` as appropriate.

Thank you for helping improve DevContainer Wizard!

### Pre-built containers

We welcome contributions to the pre-built containers! To get started:

1. **Fork the [theredguild/devcontainer](https://github.com/theredguild/devcontainer) repository** and clone it to your machine.
2. **Make your changes** in a new branch.
3. **Test your changes** locally.
4. **Commit and push** your branch.
5. **Open a pull request** with a clear description of your changes.
