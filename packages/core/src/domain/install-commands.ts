/**
 * Per-tool Containerfile install snippets.
 *
 * Ported from the original `packages/core` wizard. The snippets assume the
 * runtime contract reproduced by `containerfile/base.ts`: `USER vscode`,
 * `$HOME=/home/vscode`, zsh as the login + RUN shell (`SHELL ["/bin/zsh","-ic"]`),
 * and a PATH pre-seeded with `~/.local/bin`, `~/.cargo/bin`, `~/.local/share/pnpm`.
 * Several snippets hardcode `/home/vscode/...`, so the base image MUST keep that
 * exact user/home layout.
 *
 * `python` is intentionally a no-op marker — Python is installed inline by the
 * generator (apt deps + uv + `uv python install`), not by this snippet.
 */
export const INSTALL_COMMANDS = {
  // Deps
  python: `
# This entry exists for dependency tracking only, python is installed via uv in the generator
  `,
  rust: `
# Install rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="$HOME/.cargo/bin:$PATH"
  `,
  go: `
# Set asdf manager version
# Install golang's latest version through asdf
RUN git clone https://github.com/asdf-vm/asdf.git $HOME/.asdf --branch v0.15.0 && \
    echo '. $HOME/.asdf/asdf.sh' >> $HOME/.zshrc && \
    echo 'fpath=(\${ASDF_DIR}/completions $fpath)' >> $HOME/.zshrc && \
    echo 'autoload -Uz compinit && compinit' >> $HOME/.zshrc && \
    . $HOME/.asdf/asdf.sh && \
    asdf plugin add golang && \
    asdf install golang latest && \
    asdf global golang latest
  `,
  node: `
USER root
# Install nvm, yarn, npm, pnpm.
# HOME is pinned to /home/vscode image-wide, so root and vscode would share
# ~/.npm. Upstream's script runs the npm-version step as root but the yarn/pnpm
# steps via 'su vscode', so the shared cache ends up part root-owned and the
# 'su vscode' npm call dies with EACCES (set -e then aborts the whole script).
# Give root its own HOME: the script is fetched to a file first because an env
# prefix on 'curl ... | bash' would only apply to curl, never to the script.
RUN curl -fsSL -o /tmp/node-install.sh https://raw.githubusercontent.com/devcontainers/features/main/src/node/install.sh && HOME=/root bash /tmp/node-install.sh && rm -f /tmp/node-install.sh
RUN mkdir -p \${HOME}/.npm && chown -R vscode:vscode \${HOME}/.npm
USER vscode
# Upstream installs node under nvm at /usr/local/share/nvm and only exposes it
# through a snippet appended to the shell rc files, so node/npm/npx/corepack/pnpm
# are invisible to any non-interactive command ('dcw exec <env> -- node -v', an
# npm bin's '#!/usr/bin/env node' shebang, sshd exec channels). The script sets
# NVM_SYMLINK_CURRENT=true, so \$NVM_DIR/current is a stable symlink to the
# default version's install dir — bake its bin dir into the image PATH.
# \$PNPM_HOME is already exported and on PATH from the base image; pnpm links its
# global bins straight into \$PNPM_HOME, but its own preflight check refuses to
# run a global install unless \$PNPM_HOME/bin is on PATH too, so add that here.
ENV NVM_DIR=/usr/local/share/nvm
ENV PATH=\${NVM_DIR}/current/bin:\${PATH}:\${PNPM_HOME}/bin
  `,
  // Frameworks
  foundry: `
# Install Foundry
RUN curl -fsSL https://foundry.paradigm.xyz | zsh && \
    echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.zshrc && \
    export PATH="$HOME/.foundry/bin:$PATH" && \
    ~/.foundry/bin/foundryup
  `,
  hardhat: `
# Install Hardhat globally
RUN pnpm install hardhat -g
  `,
  ape: `
# Install Ape framework
RUN uv tool install eth-ape
  `,

  // Fuzzing & Testing
  echidna: `
# Echidna is copied from multi-stage build - verify installation
RUN echo 'Echidna installed via multi-stage build' && \\
    which echidna
  `,
  ityfuzz: `
# Install ItyFuzz
RUN curl -fsSL https://ity.fuzz.land/ | zsh && \
    echo 'export "PATH=$HOME/.ityfuzz/bin:$PATH"' >> ~/.zshrc && \
    export PATH=$HOME/.ityfuzz/bin:$PATH && \
    ~/.ityfuzz/bin/ityfuzzup
  `,
  medusa: `
# Build and install Medusa
WORKDIR $HOME/medusa
RUN git clone https://github.com/crytic/medusa $HOME/medusa && \\
    export LATEST_TAG="$(git describe --tags | sed 's/-[0-9]\\+-g\\w\\+$//')" && \\
    git checkout "$LATEST_TAG" && \\
    go build -trimpath -o=$HOME/.local/bin/medusa -ldflags="-s -w" && \\
    chmod 755 $HOME/.local/bin/medusa
WORKDIR $HOME
RUN rm -rf medusa/
  `,
  halmos: `
# Install Halmos (via uv tool)
RUN uv tool install halmos
  `,

  // Security Tooling
  slither: `
# Install Slither (via uv tool)
RUN uv tool install slither-analyzer
  `,
  mythril: `
# Install Mythril (via uv tool)
RUN uv tool install mythril
  `,
  'crytic-compile': `
# Install Crytic Compile (via uv tool)
RUN uv tool install crytic-compile
  `,
  panoramix: `
# Install Panoramix decompiler (via uv tool)
RUN uv tool install panoramix-decompiler
  `,
  'slither-lsp': `
# Install Slither LSP (via uv tool)
RUN uv tool install slither-lsp
  `,
  'napalm-toolbox': `
# Install Napalm Toolbox (via uv tool)
RUN uv tool install napalm-toolbox
  `,
  semgrep: `
# Install Semgrep (via uv tool)
RUN uv tool install semgrep
  `,
  slitherin: `
# Install Slitherin (via uv tool)
RUN uv tool install slitherin
  `,
  heimdall: `
# Install Heimdall (uses bifrost binary, requires rust/cargo env)
RUN /bin/zsh -c "curl -fsSL https://get.heimdall.rs | zsh" && \
    echo 'export PATH="$HOME/.bifrost/bin:$PATH"' >> ~/.zshrc && \
    /bin/zsh -c "source ~/.cargo/env && source ~/.zshrc && bifrost --version"
ENV PATH="/home/vscode/.bifrost/bin:/home/vscode/.cargo/bin:$PATH"
  `,

  // Languages / Compilers
  vyper: `
# Install Vyper (via uv tool)
RUN uv tool install vyper
  `,
  'solc-select': `
# Install solc-select and multiple solc versions
RUN uv tool install solc-select && \
    solc-select install 0.4.26 0.5.17 0.6.12 0.7.6 0.8.10 latest && \
    solc-select use latest
  `,

  aderyn: `
# Install Cyfrin Aderyn helper and run
RUN /bin/zsh -c "curl -fsSL https://raw.githubusercontent.com/Cyfrin/up/main/install | zsh" && \
    echo 'export PATH="$HOME/.cyfrin/bin:$PATH"' >> ~/.zshrc
ENV PATH="/home/vscode/.cyfrin/bin:$PATH"
RUN /bin/zsh -c "source ~/.zshrc && (~/.cyfrin/bin/cyfrinup || cyfrinup)"`,

  // AI coding agents (npm packages; installed globally with npm so the bin lands
  // in $NVM_DIR/current/bin next to node — on the image's ENV PATH, so they are
  // reachable from a non-interactive `dcw exec` too, not just a login shell).
  claude: `
# Install Anthropic Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code
  `,
  codex: `
# Install OpenAI Codex CLI
RUN npm install -g @openai/codex
  `,
  opencode: `
# Install opencode agent CLI
RUN npm install -g opencode-ai
  `,
} as const

export type ToolKey = keyof typeof INSTALL_COMMANDS

export function isToolKey(value: string): value is ToolKey {
  return value in INSTALL_COMMANDS
}
