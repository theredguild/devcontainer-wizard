import { describe, expect, it } from 'vitest'
import { INSTALL_COMMANDS } from '../../src/domain/install-commands.js'

describe('install snippets', () => {
  it('medusa emits a correct git-describe suffix-stripping sed (#11)', () => {
    // The non-raw template previously collapsed \+ and \w, breaking the regex.
    expect(INSTALL_COMMANDS.medusa).toContain("sed 's/-[0-9]\\+-g\\w\\+$//'")
    // …and uses real backslash-newline line continuations (not collapsed away).
    expect(INSTALL_COMMANDS.medusa).toMatch(/&& \\\n/)
  })

  it('heimdall/echidna do not self-mask install failures (#13)', () => {
    expect(INSTALL_COMMANDS.heimdall).not.toContain("|| echo 'Heimdall installed'")
    expect(INSTALL_COMMANDS.echidna).not.toContain('|| echo')
  })

  it('aderyn keeps its legitimate command fallback (#13)', () => {
    expect(INSTALL_COMMANDS.aderyn).toContain('|| cyfrinup')
  })

  it("node runs the devcontainers install.sh under root's own HOME", () => {
    // The image pins ENV HOME=/home/vscode for every user. Upstream's devcontainers
    // node install.sh runs the npm-version step as root and the yarn/pnpm steps via
    // `su vscode`; a shared ~/.npm therefore ends up part root-owned and the
    // `su vscode` npm call dies with EACCES, aborting the script under `set -e`.
    expect(INSTALL_COMMANDS.node).toContain('HOME=/root bash /tmp/node-install.sh')
    // The env prefix must sit on the interpreter, not on the fetch: an env prefix on
    // `curl ... | bash` applies only to curl and never reaches the script.
    expect(INSTALL_COMMANDS.node).not.toMatch(/HOME=\S+ curl/)
    expect(INSTALL_COMMANDS.node).not.toMatch(/install\.sh\s*\|\s*bash/)
  })

  it("node bakes nvm's bin dir into the image PATH, not just a shell rc", () => {
    // Upstream's install.sh puts node under $NVM_DIR (/usr/local/share/nvm) and
    // only sources it from ~/.zshrc, so a non-interactive `dcw exec <env> -- node`
    // — and every `#!/usr/bin/env node` shebang in an npm/pnpm global bin — fails
    // with "node: not found". It exports NVM_SYMLINK_CURRENT=true, so
    // $NVM_DIR/current is a stable symlink to the default version.
    expect(INSTALL_COMMANDS.node).toContain('ENV NVM_DIR=/usr/local/share/nvm')
    expect(INSTALL_COMMANDS.node).toContain('${NVM_DIR}/current/bin')
    expect(INSTALL_COMMANDS.node).toMatch(/^ENV PATH=\$\{NVM_DIR\}\/current\/bin:/m)
  })

  it('node puts $PNPM_HOME/bin on PATH', () => {
    // pnpm links global bins into $PNPM_HOME (already exported and on PATH by the
    // base image), but refuses to run `pnpm install -g` unless $PNPM_HOME/bin is
    // on PATH too.
    expect(INSTALL_COMMANDS.node).toContain('${PNPM_HOME}/bin')
    // …and does not re-export or re-append $PNPM_HOME itself: the base image
    // already did, and chained `ENV PATH=${PATH}:…` lines duplicate entries.
    expect(INSTALL_COMMANDS.node).not.toMatch(/^ENV PNPM_HOME=/m)
    expect(INSTALL_COMMANDS.node).not.toMatch(/\$\{PNPM_HOME\}(?!\/bin)/)
  })
})
