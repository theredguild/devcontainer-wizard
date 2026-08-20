/**
 * Base-image fragments for a plain Debian image that reproduces the exact
 * runtime contract the install snippets assume: a non-root `vscode` user with
 * uid 1000, `$HOME=/home/vscode`, zsh as login + RUN shell, passwordless sudo,
 * and a PATH pre-seeded with ~/.local/bin, ~/.cargo/bin, ~/.local/share/pnpm.
 *
 * Replaces the original devcontainer base image. `git` now comes from apt
 * (it used to be a devcontainer feature); github-cli is intentionally dropped.
 */

export const SYNTAX_DIRECTIVES = ['# syntax=docker/dockerfile:1.8', '# check=error=true']

export const ECHIDNA_STAGE = [
  '# Multi-stage build for Echidna',
  'FROM --platform=linux/amd64 ghcr.io/crytic/echidna/echidna:latest AS echidna',
  '',
]

/** FROM + base apt packages + non-root user + /workspace, all as root. */
export const BASE_IMAGE = [
  '# Base image: Debian 13 (trixie) — current Debian stable',
  'FROM debian:trixie',
  '',
  '# Base packages (git replaces the old devcontainer git feature)',
  'RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\',
  '      bash-completion \\',
  '      build-essential \\',
  '      ca-certificates \\',
  '      curl \\',
  '      git \\',
  '      gnupg \\',
  '      jq \\',
  '      locales \\',
  '      pkg-config \\',
  '      sudo \\',
  '      unzip \\',
  '      vim \\',
  '      wget \\',
  '      zsh \\',
  '      && rm -rf /var/lib/apt/lists/*',
  '',
  "# Create the non-root 'vscode' user (uid 1000) with zsh + passwordless sudo",
  'RUN useradd --create-home --shell /usr/bin/zsh --uid 1000 vscode \\',
  '      && usermod -aG sudo vscode \\',
  "      && echo 'vscode ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/vscode \\",
  '      && chmod 0440 /etc/sudoers.d/vscode \\',
  '      && mkdir -p /workspace && chown vscode:vscode /workspace',
]

/** Python apt deps, installed as root before dropping privileges. */
export const PYTHON_APT = [
  '# Install Python build dependencies',
  'RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\',
  '      python3-pip \\',
  '      libpython3-dev \\',
  '      python3-dev \\',
  '      python3-venv \\',
  '      && rm -rf /var/lib/apt/lists/*',
]

/** Drop to the vscode user and set up HOME/PATH/shell; matches the snippet contract. */
export const USER_ENV = [
  '# Switch to vscode (drop privileges)',
  'USER vscode',
  'WORKDIR /home/vscode',
  'ENV HOME=/home/vscode',
  '# Update PATH',
  'ENV USR_LOCAL_BIN=/usr/local/bin',
  'ENV LOCAL_BIN=${HOME}/.local/bin',
  'ENV PNPM_HOME=${HOME}/.local/share/pnpm',
  'ENV PATH=${PATH}:${USR_LOCAL_BIN}:${LOCAL_BIN}:${PNPM_HOME}',
  '# Ensure ~/.local/bin, ~/.zshrc, and the dcw install-report dir exist',
  'RUN mkdir -p ${HOME}/.local/bin ${HOME}/.dcw && touch ${HOME}/.zshrc',
]

/** uv installer + Python 3.12, after the user switch (needs python apt deps). */
export const UV_INSTALL = [
  '# Install uv',
  'RUN curl -LsSf https://astral.sh/uv/install.sh | sh',
  'ENV UV_LOCAL_BIN=$HOME/.cargo/bin',
  '# Only the new entry is appended — the rest are already on PATH from USER_ENV.',
  'ENV PATH=${PATH}:${UV_LOCAL_BIN}',
  '# Install Python 3.12 with uv',
  'RUN uv python install 3.12',
]

/** Set zsh as the RUN shell so subsequent snippets source ~/.zshrc as written. */
export const SHELL_ZSH = [
  '# Use zsh for subsequent RUN commands',
  'ENV SHELL=/usr/bin/zsh',
  'SHELL ["/bin/zsh", "-ic"]',
]

/**
 * OpenSSH server for editor attach (Zed / VS Code / Cursor / Antigravity / any
 * Remote-SSH editor). Designed to run **rootless**: `dcw attach` connects with
 * `sshd -i` (inetd mode) exec'd as the vscode user, so there is no listening
 * daemon and no open ports by default — it works even under `network-none` and
 * `drop-caps=ALL`.
 *
 * The sshd config is baked at /etc/ssh/sshd_config.dcw (outside ~/.ssh, so a
 * readonly-os tmpfs over ~/.ssh can't shadow it). Host key + authorized_keys live
 * under ~/.ssh, which is writable in every mode: the real rootfs dir normally, a
 * tmpfs under readonly-os. `dcw attach` generates the host key at runtime if the
 * tmpfs starts empty and injects the public key — neither is required to be baked.
 * `StrictModes no` keeps sshd from refusing the home dir under a tmpfs mount.
 */
export const SSHD_SETUP = [
  '# OpenSSH server for editor attach over SSH (rootless `sshd -i`).',
  'RUN sudo apt-get update \\',
  '      && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\',
  '           openssh-server \\',
  '      && sudo rm -rf /var/lib/apt/lists/* \\',
  '      && mkdir -p ${HOME}/.ssh && chmod 700 ${HOME}/.ssh \\',
  '      && ssh-keygen -q -t ed25519 -N "" -f ${HOME}/.ssh/ssh_host_ed25519_key \\',
  '      && touch ${HOME}/.ssh/authorized_keys && chmod 600 ${HOME}/.ssh/authorized_keys \\',
  '      && printf "%s\\n" \\',
  '           "HostKey /home/vscode/.ssh/ssh_host_ed25519_key" \\',
  '           "PidFile /home/vscode/.ssh/sshd.pid" \\',
  '           "UsePAM no" \\',
  '           "PasswordAuthentication no" \\',
  '           "PubkeyAuthentication yes" \\',
  '           "AuthorizedKeysFile /home/vscode/.ssh/authorized_keys" \\',
  '           "Subsystem sftp internal-sftp" \\',
  '           "AllowTcpForwarding yes" \\',
  '           "PermitUserEnvironment no" \\',
  '           "StrictModes no" \\',
  '           "LogLevel QUIET" \\',
  '         | sudo tee /etc/ssh/sshd_config.dcw > /dev/null',
]

/** Absolute path to the sshd config baked by SSHD_SETUP (outside ~/.ssh). */
export const SSHD_CONFIG_PATH = '/etc/ssh/sshd_config.dcw'
