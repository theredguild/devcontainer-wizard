# syntax=docker/dockerfile:1.10.0
# check=error=true

# Pull latest Echidna prebuilt image
FROM --platform=linux/amd64 ghcr.io/crytic/echidna/echidna AS echidna

# Pull Debian 12 
FROM mcr.microsoft.com/vscode/devcontainers/base:bookworm

# Switch to root user
USER root

# Super basic stuff to get everything started
RUN apt-get update -y && apt-get install -y \
    zsh python3-pip python3-venv python3-dev libpython3-dev build-essential vim curl git sudo pkg-config \
    --no-install-recommends

# The base container usually has a “vscode” user. If not, create one here.
RUN echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to vscode (drop privs)
USER vscode
WORKDIR /home/vscode
ENV HOME=/home/vscode

# Set neded paths (for python, pnpm)
ENV USR_LOCAL_BIN=/usr/local/bin
ENV LOCAL_BIN=${HOME}/.local/bin
ENV PNPM_HOME=${HOME}/.local/share/pnpm
ENV PATH=${PATH}:${USR_LOCAL_BIN}:${LOCAL_BIN}:${PNPM_HOME}

# Configure pip to allow system packages in container environment
ENV PIP_BREAK_SYSTEM_PACKAGES=1

# Install uv package manager"
RUN python3 -m pip install --no-cache-dir --upgrade uv

# Set asdf manager version
ENV ASDF_VERSION=v0.15.0

# Set the default shell to zsh
ENV SHELL=/usr/bin/zsh

# Running everything under zsh
SHELL ["/usr/bin/zsh", "-ic"]

# Install golang's latest version through asdf
RUN git clone https://github.com/asdf-vm/asdf.git $HOME/.asdf --branch ${ASDF_VERSION}  && \
    echo '. $HOME/.asdf/asdf.sh' >> $HOME/.zshrc && \
    echo 'fpath=(${ASDF_DIR}/completions $fpath)' >> $HOME/.zshrc && \
    echo 'autoload -Uz compinit && compinit' >> $HOME/.zshrc && \
    . $HOME/.asdf/asdf.sh && \
    asdf plugin add golang && \
    asdf install golang latest && \
    asdf global golang latest

## Install rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env

USER root

## Install nvm, yarn, npm, pnpm
RUN curl -o- https://raw.githubusercontent.com/devcontainers/features/main/src/node/install.sh | bash
RUN chown -R vscode:vscode ${HOME}/.npm
USER vscode 

# Install Foundry (Forge, Cast, Anvil)
RUN curl -L https://foundry.paradigm.xyz | zsh
RUN foundryup

# Install slither, mythril, crytic-compile
RUN uv tool install slither-analyzer && \
    uv tool install mythril && \
    uv tool install crytic-compile 

# Install Hardhat
RUN pnpm install -g hardhat solhint

# Copy prebuilt Echidna binary
COPY --chown=vscode:vscode --from=echidna /usr/local/bin/echidna ${HOME}/.local/bin/echidna
RUN chmod 755 ${HOME}/.local/bin/echidna

# Switch to non-root user
USER vscode

# Set up user environment
RUN echo 'export PATH="/usr/local/foundry/bin:$PATH"' >> /home/vscode/.zshrc

USER root

## Clean
RUN apt-get autoremove -y && apt-get clean -y

USER vscode