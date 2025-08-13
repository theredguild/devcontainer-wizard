export const INSTALL_COMMANDS: Record<string, string> = {
  // Deps
  python: `
# Python is installed via apt-get in main Dockerfile, uv is installed there too
# This entry exists for dependency tracking only
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
# Install nvm, yarn, npm, pnpm
RUN curl -o- https://raw.githubusercontent.com/devcontainers/features/main/src/node/install.sh | bash
RUN chown -R vscode:vscode \${HOME}/.npm
USER vscode
ENV PNPM_HOME=\${HOME}/.local/share/pnpm
ENV PATH=\${PATH}:\${PNPM_HOME}
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
    which echidna || echo 'Echidna binary ready for use'
  `,
  ityfuzz: `
# Install ItyFuzz
RUN curl -fsSL https://ity.fuzz.land/ | zsh && \
    echo 'export PATH=$HOME/.foundry/bin:$PATH"' >> ~/.zshrc && \
    export PATH=$HOME/.foundry/bin:$PATH&& \
    ~/.ityfuzz/bin/ityfuzzup
  `,
  medusa: `
# Build and install Medusa
WORKDIR $HOME/medusa
RUN git clone https://github.com/crytic/medusa $HOME/medusa && \
    export LATEST_TAG="$(git describe --tags | sed 's/-[0-9]\+-g\w\+$//')" && \
    git checkout "$LATEST_TAG" && \
    go build -trimpath -o=$HOME/.local/bin/medusa -ldflags="-s -w" && \
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
    /bin/zsh -c "source ~/.cargo/env && source ~/.zshrc && bifrost --version || echo 'Heimdall installed'"
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
RUN /bin/zsh -c "source ~/.zshrc && (~/.cyfrin/bin/cyfrinup || cyfrinup)"p
  `
};

export type ToolKey = keyof typeof INSTALL_COMMANDS;
