import { describe, expect, it } from 'vitest'
import { generateContainerfile } from '../../src/containerfile/generate.js'

describe('generateContainerfile', () => {
  it('emits the syntax/check directives and a plain Debian base', () => {
    const cf = generateContainerfile({ selections: {} })
    expect(cf.startsWith('# syntax=docker/dockerfile:1.8')).toBe(true)
    expect(cf).toContain('# check=error=true')
    expect(cf).toContain('FROM debian:trixie')
    expect(cf).not.toContain('mcr.microsoft.com')
  })

  it('reproduces the vscode user / zsh / PATH contract', () => {
    const cf = generateContainerfile({ selections: {} })
    expect(cf).toContain('useradd --create-home --shell /usr/bin/zsh --uid 1000 vscode')
    expect(cf).toContain('USER vscode')
    expect(cf).toContain('ENV HOME=/home/vscode')
    expect(cf).toContain('SHELL ["/bin/zsh", "-ic"]')
    expect(cf).toContain('git \\') // git via apt, not a devcontainer feature
  })

  it('does not generate any devcontainer.json artifacts', () => {
    const cf = generateContainerfile({ selections: { frameworks: ['foundry'] } })
    expect(cf).not.toContain('devcontainer.json')
    expect(cf).not.toContain('customizations')
    expect(cf).not.toContain('remoteUser')
    expect(cf).not.toContain('workspaceMount')
  })

  it('installs Python (uv) only when required', () => {
    const withPy = generateContainerfile({ selections: { languages: ['solidity'] } })
    expect(withPy).toContain('uv python install 3.12')
    expect(withPy).toContain('python3-venv')
    const withoutPy = generateContainerfile({ selections: { coreLanguages: ['rust'] } })
    expect(withoutPy).not.toContain('uv python install 3.12')
  })

  it('orders runtimes before other tools', () => {
    const cf = generateContainerfile({ selections: { frameworks: ['foundry'], fuzzingAndTesting: ['ityfuzz'] } })
    expect(cf.indexOf('Install rust')).toBeGreaterThan(-1)
    expect(cf.indexOf('rustup.rs')).toBeLessThan(cf.indexOf('foundry.paradigm.xyz'))
    expect(cf.indexOf('rustup.rs')).toBeLessThan(cf.indexOf('ity.fuzz.land'))
  })

  it('adds the echidna multi-stage build and copy when selected', () => {
    const cf = generateContainerfile({ selections: { fuzzingAndTesting: ['echidna'] } })
    expect(cf).toContain('AS echidna')
    expect(cf).toContain('COPY --from=echidna /usr/local/bin/echidna /usr/local/bin/echidna')
  })

  it('installs AI coding agents via npm and pulls Node', () => {
    const cf = generateContainerfile({ selections: { aiAgents: ['claude', 'codex', 'opencode'] } })
    expect(cf).toContain('npm install -g @anthropic-ai/claude-code')
    expect(cf).toContain('npm install -g @openai/codex')
    expect(cf).toContain('npm install -g opencode-ai')
    // node runtime is pulled in as a dependency and installed before the agents
    expect(cf.indexOf('install.sh')).toBeLessThan(cf.indexOf('@anthropic-ai/claude-code'))
  })

  it('emits an optional git clone step', () => {
    const cf = generateContainerfile({
      selections: {},
      gitRepository: { enabled: true, url: 'https://github.com/foo/bar', branch: 'main' },
    })
    expect(cf).toContain('git clone --branch main https://github.com/foo/bar /home/vscode/repos/project')
  })

  it('refuses to splice an unsafe git url/branch into the clone line (#2)', () => {
    expect(() =>
      generateContainerfile({
        selections: {},
        gitRepository: { enabled: true, url: 'https://x\nRUN echo pwned' },
      }),
    ).toThrow(/unsafe characters/)
    expect(() =>
      generateContainerfile({
        selections: {},
        gitRepository: { enabled: true, url: 'https://github.com/foo/bar', branch: 'main; id' },
      }),
    ).toThrow(/unsafe characters/)
  })

  it('ends with WORKDIR /workspace', () => {
    const cf = generateContainerfile({ selections: {} })
    expect(cf.trimEnd().endsWith('WORKDIR /workspace')).toBe(true)
  })

  it('installs the SSH server by default and omits it under --no-ssh', () => {
    const withSsh = generateContainerfile({ selections: {} })
    expect(withSsh).toContain('openssh-server')
    expect(withSsh).toContain('ssh_host_ed25519_key')

    const noSsh = generateContainerfile({ selections: {}, ssh: false })
    expect(noSsh).not.toContain('openssh-server')
  })

  it('is stable for a fixed selection (snapshot)', () => {
    const cf = generateContainerfile({
      selections: { coreLanguages: ['rust'], frameworks: ['foundry'], securityTooling: ['slither'] },
    })
    expect(cf).toMatchSnapshot()
  })
})

describe('codex-security findings', () => {
  it('installs the libssl1.1 shim over HTTPS with a pinned SHA-256 (CS#1)', () => {
    const cf = generateContainerfile({ selections: { frameworks: ['foundry'], fuzzingAndTesting: ['ityfuzz'] } })
    expect(cf).not.toMatch(/http:\/\//)
    expect(cf).toContain("--proto '=https'")
    expect(cf).toContain('sha256sum -c -')
    expect(cf).toContain('aadf8b4b197335645b230c2839b4517aa444fd2e8f434e5438c48a18857988f7')
    // digest check must precede dpkg
    expect(cf.indexOf('sha256sum -c -')).toBeLessThan(cf.indexOf('sudo dpkg -i /tmp/libssl1.1.deb'))
  })

  it('never emits a plain-HTTP download anywhere in a kitchen-sink Containerfile (CS#1)', () => {
    const cf = generateContainerfile({
      selections: {
        coreLanguages: ['rust', 'go', 'node'],
        languages: ['solidity', 'vyper'],
        frameworks: ['foundry', 'hardhat'],
        fuzzingAndTesting: ['ityfuzz', 'echidna', 'medusa'],
        securityTooling: ['slither', 'aderyn', 'heimdall'],
        aiAgents: ['claude'],
      },
    })
    expect(cf).not.toMatch(/\bhttp:\/\//)
  })
})
