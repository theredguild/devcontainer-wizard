# TBD - web3-devcontainer-cli

 A CLI to setup a full equiped web3 dev container. 

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

2. [VS Code](https://code.visualstudio.com/) with the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) installed.


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


## Pre-built containers

### Minimal

### The Red Guild

### Auditor

### Hardened

### Paranoid

## Usage

### Start prebuilt containers

```bash
web3-devcontainer-cli select [CONTAINER]
```

#### Github Codespaces

You can also run our prebuilt containers using GitHub Codespaces: 

[![Open in Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&template_repository=theredguild/web3-devcontainer-cli)