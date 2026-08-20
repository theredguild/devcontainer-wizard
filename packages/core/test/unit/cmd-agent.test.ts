import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver
/** Scripted `execCapture` results, consumed in call order. */
let captures: Array<{ code: number; stdout?: string; stderr?: string }>

vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return {
    ...actual,
    resolveEngine: async () => ({ driver, detect: { available: true }, platform: { supported: true } }),
  }
})

vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  // Skip the real `sw_vers` probe: it spawns a subprocess on every resolve.
  return { ...actual, detectHost: async () => ({ os: 'linux', arch: 'x64' }) }
})

const { default: Agent, assessAirgap } = await import('../../src/commands/agent.js')
const { saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

const started = (over: Record<string, unknown> = {}, spec: Record<string, unknown> = {}) =>
  manifest({
    name: 'env1',
    engine: 'docker',
    spec: { name: 'env1', engine: 'auto', selections: {}, hardening: [], ssh: true, ...spec } as never,
    container: { id: 'cid-1', name: 'dcw-env1', status: 'running', appliedFlags: [], ...over } as never,
  })

beforeEach(async () => {
  state = await useTempState('dcw-agent-')
  captures = []
  driver = new FakeDriver({ name: 'docker' })
  vi.spyOn(driver, 'execCapture').mockImplementation(async (spec) => {
    driver.execs.push(spec)
    const next = captures.shift() ?? { code: 0 }
    return { code: next.code, stdout: next.stdout ?? '', stderr: next.stderr ?? '', spawnError: false }
  })
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.OPENAI_API_KEY
})

afterEach(async () => {
  await state.cleanup()
  vi.restoreAllMocks()
})

describe('assessAirgap', () => {
  it("returns 'none' when no air-gap was ever requested", () => {
    expect(assessAirgap(started())).toBe('none')
  })

  it("returns 'enforced' only when --network=none is in the flags the container actually got", () => {
    expect(assessAirgap(started({ appliedFlags: ['--network=none'] }, { hardening: ['network-none'] }))).toBe('enforced')
  })

  it("returns 'dropped' when the engine recorded the air-gap as dropped", () => {
    expect(
      assessAirgap(started({ appliedFlags: ['--cap-drop=ALL'], droppedHardening: ['network-none'] }, { hardening: ['network-none'] })),
    ).toBe('dropped')
  })

  it("returns 'dropped' when the applied flags simply lack the air-gap", () => {
    expect(assessAirgap(started({ appliedFlags: ['--cap-drop=ALL'] }, { hardening: ['network-none'] }))).toBe('dropped')
  })

  it("returns 'unknown' — never 'enforced' — when there is no record of what was applied", () => {
    // Absence of evidence is not evidence of enforcement.
    expect(assessAirgap(started({ appliedFlags: [] }, { hardening: ['network-none'] }))).toBe('unknown')
    expect(assessAirgap(started({ appliedFlags: undefined }, { hardening: ['network-none'] }))).toBe('unknown')
    expect(assessAirgap(manifest({ name: 'env1', spec: { name: 'env1', engine: 'auto', selections: {}, hardening: ['network-none'], ssh: true } }))).toBe('unknown')
  })
})

describe('dcw agent', () => {
  it('runs the agent through an interactive zsh so the nvm PATH is loaded', async () => {
    await saveManifest(started())
    const { exitCode } = await runCommand(Agent, { argv: ['claude'], flags: {} })

    expect(exitCode).toBe(0)
    // First exec is the presence probe, second is the agent itself.
    expect(driver.execs[0]?.cmd).toEqual(['zsh', '-ic', 'command -v claude'])
    expect(driver.execs[1]?.cmd).toEqual(['zsh', '-ic', 'exec claude "$@"', 'claude'])
  })

  it('forwards trailing arguments as positionals so they are not re-split', async () => {
    await saveManifest(started())
    await runCommand(Agent, { argv: ['opencode', 'run', 'review this contract'], flags: {} })
    expect(driver.execs[1]?.cmd).toEqual([
      'zsh',
      '-ic',
      'exec opencode "$@"',
      'opencode',
      'run',
      'review this contract',
    ])
  })

  it('treats the second token as the environment only when it names one', async () => {
    await saveManifest(started())
    await runCommand(Agent, { argv: ['claude', 'env1', '--resume'], flags: {} })
    expect(driver.execs[1]?.cmd.slice(3)).toEqual(['claude', '--resume'])
  })

  it('treats a non-environment second token as an agent argument', async () => {
    await saveManifest(started())
    await runCommand(Agent, { argv: ['claude', 'chat'], flags: {} })
    expect(driver.execs[1]?.cmd.slice(3)).toEqual(['claude', 'chat'])
  })

  it('never treats a leading flag-like token as an environment name', async () => {
    await saveManifest(started())
    await runCommand(Agent, { argv: ['claude', '--resume'], flags: {} })
    expect(driver.execs[1]?.cmd.slice(3)).toEqual(['claude', '--resume'])
  })

  it('rejects an unknown agent type', async () => {
    await saveManifest(started())
    await expect(runCommand(Agent, { argv: ['gemini'], flags: {} })).rejects.toMatchObject({ code: 'E_VALIDATION' })
  })

  it("forwards the agent's provider key from the host", async () => {
    await saveManifest(started())
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x'
    const { warns } = await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(driver.execs[1]?.env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-x' })
    expect(warns).toEqual([])
  })

  it('forwards extra variables named with --env, by name only', async () => {
    await saveManifest(started())
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x'
    process.env.GITHUB_TOKEN = 'ghp_x'
    try {
      await runCommand(Agent, { argv: ['claude'], flags: { env: ['GITHUB_TOKEN'] } })
      expect(driver.execs[1]?.env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-x', GITHUB_TOKEN: 'ghp_x' })
    } finally {
      delete process.env.GITHUB_TOKEN
    }
  })

  it('warns when no provider key is present on the host', async () => {
    await saveManifest(started())
    const { warns } = await runCommand(Agent, { argv: ['codex'], flags: {} })
    expect(warns).toEqual(['No API key found on the host (OPENAI_API_KEY); codex will rely on its own login.'])
  })

  it('accepts either provider key for opencode', async () => {
    await saveManifest(started())
    process.env.OPENAI_API_KEY = 'sk-oai'
    const { warns } = await runCommand(Agent, { argv: ['opencode'], flags: {} })
    expect(warns).toEqual([])
    expect(driver.execs[1]?.env).toEqual({ OPENAI_API_KEY: 'sk-oai' })
  })

  it('refuses to run in an enforced air-gap under --strict, and warns otherwise', async () => {
    await saveManifest(started({ appliedFlags: ['--network=none'] }, { hardening: ['network-none'] }))
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x'

    const { warns } = await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(warns[0]).toContain('cannot reach its API')

    await expect(runCommand(Agent, { argv: ['claude'], flags: { strict: true } })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
  })

  it('warns loudly when a requested air-gap was dropped, because credentials are about to be forwarded', async () => {
    await saveManifest(
      started({ appliedFlags: ['--cap-drop=ALL'], droppedHardening: ['network-none'] }, { hardening: ['network-none'] }),
    )
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x'

    const { warns } = await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(warns[0]).toContain('this container HAS network access')

    await expect(runCommand(Agent, { argv: ['claude'], flags: { strict: true } })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
  })

  it('treats an unrecorded air-gap as unsafe rather than assuming it holds', async () => {
    await saveManifest(started({ appliedFlags: [] }, { hardening: ['network-none'] }))
    process.env.ANTHROPIC_API_KEY = 'sk-ant-x'
    const { warns } = await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(warns[0]).toContain('no record that it was applied')

    await expect(runCommand(Agent, { argv: ['claude'], flags: { strict: true } })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
  })

  it('refuses a container with dropped hardening under --strict before touching it', async () => {
    await saveManifest(started({ droppedHardening: ['drop-caps'] }))
    await expect(runCommand(Agent, { argv: ['claude'], flags: { strict: true } })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
    // Nothing was installed, nothing was exec'd, no credentials were forwarded.
    expect(driver.execs).toEqual([])
  })

  it('points at --install when the agent binary is missing', async () => {
    await saveManifest(started())
    captures = [{ code: 1 }]
    await expect(runCommand(Agent, { argv: ['claude'], flags: {} })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
      message: expect.stringContaining('--install'),
    })
  })

  it('installs the agent on demand with --install', async () => {
    await saveManifest(started())
    captures = [{ code: 1 }, { code: 0 }]
    const { logs, exitCode } = await runCommand(Agent, { argv: ['claude'], flags: { install: true } })

    expect(logs).toEqual(['Installing claude (npm install -g @anthropic-ai/claude-code)…'])
    expect(driver.execs[1]?.cmd).toEqual(['zsh', '-ic', 'npm install -g @anthropic-ai/claude-code'])
    expect(exitCode).toBe(0)
  })

  it('reports the installer stderr when the on-demand install fails', async () => {
    await saveManifest(started())
    captures = [{ code: 1 }, { code: 1, stderr: 'E404 not found\n' }]
    await expect(runCommand(Agent, { argv: ['claude'], flags: { install: true } })).rejects.toMatchObject({
      message: 'Failed to install @anthropic-ai/claude-code: E404 not found',
    })
  })

  it('falls back to installer stdout when stderr is empty', async () => {
    await saveManifest(started())
    captures = [{ code: 1 }, { code: 1, stdout: 'no space left\n' }]
    await expect(runCommand(Agent, { argv: ['claude'], flags: { install: true } })).rejects.toMatchObject({
      message: 'Failed to install @anthropic-ai/claude-code: no space left',
    })
  })

  it('raises E_NOT_FOUND when the environment has no container', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await expect(runCommand(Agent, { argv: ['claude'], flags: {} })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
      message: expect.stringContaining('dcw up env1'),
    })
  })

  it('falls back to the container name when no id was recorded', async () => {
    await saveManifest(started({ id: undefined }))
    await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(driver.execs[0]?.container).toBe('dcw-env1')
  })

  it('propagates the agent exit code', async () => {
    await saveManifest(started())
    driver = new FakeDriver({ name: 'docker', execResult: 130 })
    vi.spyOn(driver, 'execCapture').mockResolvedValue({ code: 0, stdout: '', stderr: '', spawnError: false })
    const { exitCode } = await runCommand(Agent, { argv: ['claude'], flags: {} })
    expect(exitCode).toBe(130)
  })
})
