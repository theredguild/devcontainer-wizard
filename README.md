## web3-devcontainer-cli

A CLI to set up a fully equipped Web3 dev container, with an interactive wizard to generate custom environments or launch pre-built ones.

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
pnpm install -g web3-devcontainer-cli
```

```bash
npm install -g web3-devcontainer-cli
```

```bash
yarn global add web3-devcontainer-cli
```

## Usage

### Quick start

```bash
web3-devcontainer-cli start
```

- Select a pre-built container or create your own via the wizard.

### Create your own devcontainer

```bash
web3-devcontainer-cli create [NAME]
```

The wizard will prompt you for:

- **Devcontainer name**: defaults to the current directory name.
- **Languages**: Solidity, Vyper.
- **Frameworks**: Foundry, Hardhat, Ape (ApeWorX).
- **Fuzzing & testing**: Echidna, Medusa, Halmos, Ityfuzz, Aderyn.
- **Security tooling**: Slither, Mythril, Crytic (crytic-compile), Panoramix, Semgrep, Heimdall.
- **System hardening** (applied to `devcontainer.json`):
  - Read-only file system
  - Workspace isolation (tmpfs) [writeable or no-write]
  - Secure temp directories
  - Drop all capabilities / disable raw packets
  - No new privileges
  - AppArmor, Seccomp
  - Disable IPv6, secure DNS
  - Network none
  - Resource limits
- **VS Code extensions**: choose recommended or select your own.
- **Save path**: where `.devcontainer/<name>` will be created.

When finished, the CLI writes `Dockerfile` and `devcontainer.json` to `.devcontainer/<name>` and offers to start it immediately. It also prints the exact `devcontainer up` command you can run later.

### Start pre-built containers

```bash
web3-devcontainer-cli prebuilt [CONTAINER]
```

- **List available options**:

```bash
web3-devcontainer-cli prebuilt --list
# or
web3-devcontainer-cli prebuilt -l
```

- **Available containers**: `minimal`, `theredguild`, `auditor`.
- You will be prompted how to open it (Terminal; VS Code coming soon).

#### GitHub Codespaces

You can also run prebuilt containers using GitHub Codespaces: 

[![Open in Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&template_repository=theredguild/web3-devcontainer-cli)

## Pre-built containers

- **Minimal**: Beginner-friendly environment.
- **Auditor**: Audit-ready environment with common security tooling.
- **The Red Guild**: The Red Guild's original devcontainer.
- **Hardened**: Coming soon.
- **Paranoid**: Coming soon.
