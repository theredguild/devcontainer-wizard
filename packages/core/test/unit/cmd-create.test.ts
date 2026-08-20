import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { FakeDriver } from '../engine/fake-driver.js'
import { useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver
const mountWizard = vi.fn(async (_opts: unknown) => null as unknown)

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return {
    ...actual,
    resolveEngineFor: vi.fn(async () => ({
      driver,
      engineName: driver.name,
      capabilities: driver.capabilities,
    })),
  }
})
vi.mock('../../src/wizard/run.js', () => ({ mountWizard: (opts: unknown) => mountWizard(opts) }))

const { default: Create } = await import('../../src/commands/create.js')
const { loadManifest, saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

/** oclif's parsed defaults for the flags create declares. */
const base = { ssh: true, build: false, up: false, force: false, yes: false, 'no-input': true, strict: false }

beforeEach(async () => {
  state = await useTempState('dcw-create-')
  driver = new FakeDriver({ name: 'docker', displayName: 'Docker' })
  mountWizard.mockReset().mockResolvedValue(null)
})

afterEach(async () => {
  await state.cleanup()
  vi.restoreAllMocks()
})

describe('dcw create (non-interactive)', () => {
  it('writes a manifest from flags and stops before building', async () => {
    const { result } = await runCommand<Record<string, any>>(Create, {
      flags: { ...base, name: 'contracts', 'core-lang': ['rust'], framework: ['foundry'], sec: ['slither'] },
      json: true,
    })

    expect(result).toMatchObject({ name: 'contracts', built: false, started: false, failedTools: [], toolsVerified: true })
    expect(result?.spec.selections).toEqual({
      coreLanguages: ['rust'],
      frameworks: ['foundry'],
      securityTooling: ['slither'],
    })
    expect(driver.builds).toEqual([])
    const saved = await loadManifest('contracts')
    expect(saved?.resolved.requiredTools).toContain('foundry')
  })

  it('maps every selection flag onto its spec category', async () => {
    const { result } = await runCommand<{ spec: { selections: Record<string, string[]> } }>(Create, {
      flags: {
        ...base,
        name: 'wide',
        'core-lang': ['python'],
        lang: ['solidity'],
        framework: ['hardhat'],
        fuzz: ['echidna'],
        sec: ['semgrep'],
        'ai-agent': ['claude'],
      },
      json: true,
    })
    expect(result?.spec.selections).toEqual({
      coreLanguages: ['python'],
      languages: ['solidity'],
      frameworks: ['hardhat'],
      fuzzingAndTesting: ['echidna'],
      securityTooling: ['semgrep'],
      aiAgents: ['claude'],
    })
  })

  it('derives the name from the working directory when --name is omitted', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/My Project')
    const { result } = await runCommand<{ name: string }>(Create, { flags: { ...base }, json: true })
    expect(result?.name).toBe('my-project')
  })

  it('applies the default profile when no hardening choice is made at all', async () => {
    const { result } = await runCommand<{ spec: { profile?: string; hardening: string[] } }>(Create, {
      flags: { ...base, name: 'plain' },
      json: true,
    })
    // A bare `create` must not produce an unhardened environment against which
    // --strict would then pass vacuously.
    expect(result?.spec.profile).toBe('development')
    expect(result?.spec.hardening.length).toBeGreaterThan(0)
  })

  it("honors --profile none as the explicit opt-out", async () => {
    const { result } = await runCommand<{ spec: { hardening: string[] } }>(Create, {
      flags: { ...base, name: 'bare', profile: 'none' },
      json: true,
    })
    expect(result?.spec.hardening).toEqual([])
  })

  it('records the git repository and branch', async () => {
    const { result } = await runCommand<{ spec: { gitRepository?: Record<string, unknown> } }>(Create, {
      flags: { ...base, name: 'cloned', 'git-url': 'https://github.com/o/r.git', 'git-branch': 'main' },
      json: true,
    })
    expect(result?.spec.gitRepository).toEqual({ url: 'https://github.com/o/r.git', branch: 'main', enabled: true })
  })

  it('honors --no-ssh', async () => {
    const { result } = await runCommand<{ spec: { ssh: boolean } }>(Create, {
      flags: { ...base, name: 'nossh', ssh: false },
      json: true,
    })
    expect(result?.spec.ssh).toBe(false)
  })

  it('refuses to clobber an existing environment without --force', async () => {
    await runCommand(Create, { flags: { ...base, name: 'dupe' }, json: true })
    await expect(runCommand(Create, { flags: { ...base, name: 'dupe' }, json: true })).rejects.toMatchObject({
      code: 'E_VALIDATION',
      message: expect.stringContaining('--force'),
    })
  })

  it('overwrites an existing environment with --force', async () => {
    await runCommand(Create, { flags: { ...base, name: 'dupe' }, json: true })
    const { result } = await runCommand<{ spec: { selections: Record<string, unknown> } }>(Create, {
      flags: { ...base, name: 'dupe', force: true, framework: ['ape'] },
      json: true,
    })
    expect(result?.spec.selections).toEqual({ frameworks: ['ape'] })
  })

  it('rejects an unknown hardening key', async () => {
    await expect(
      runCommand(Create, { flags: { ...base, name: 'bad', harden: ['not-a-thing'] }, json: true }),
    ).rejects.toMatchObject({ code: 'E_VALIDATION' })
  })
})

describe('dcw create --build / --up', () => {
  it('--build builds the image but starts nothing', async () => {
    const { result } = await runCommand<Record<string, any>>(Create, {
      flags: { ...base, name: 'b', build: true },
      json: true,
    })
    expect(result).toMatchObject({ built: true, started: false, container: undefined, hardening: undefined })
    expect(driver.builds).toHaveLength(1)
    expect(driver.runs).toEqual([])
    expect((await loadManifest('b'))?.image?.tag).toBe('dcw/b:latest')
  })

  it('--up builds, clears any stale container, starts, and reports hardening', async () => {
    const { result } = await runCommand<Record<string, any>>(Create, {
      flags: { ...base, name: 'u', up: true },
      json: true,
    })
    expect(result).toMatchObject({ built: true, started: true, container: 'cid-dcw-u' })
    expect(result?.hardening).toMatchObject({ dropped: [], unenforced: [] })
    expect(driver.rms).toEqual([{ id: 'dcw-u', force: true }])
    expect((await loadManifest('u'))?.container?.id).toBe('cid-dcw-u')
  })

  it('ignores a failure from the best-effort stale-container removal', async () => {
    vi.spyOn(driver, 'rm').mockRejectedValue(new Error('no such container'))
    const { result } = await runCommand<{ started: boolean }>(Create, {
      flags: { ...base, name: 'u', up: true },
      json: true,
    })
    expect(result?.started).toBe(true)
  })

  it('surfaces dropped hardening in the JSON envelope rather than only to humans', async () => {
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ networkNone: { support: 'unsupported', note: 'no air-gap here' } }),
    })
    const { result } = await runCommand<{ hardening: { dropped: string[] } }>(Create, {
      flags: { ...base, name: 'gapped', profile: 'airgapped', up: true },
      json: true,
    })
    expect(result?.hardening.dropped).toContain('network-none')
  })

  it('fails a doomed --strict --up run before paying for the build', async () => {
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ networkNone: { support: 'unsupported', note: 'no air-gap here' } }),
    })
    await expect(
      runCommand(Create, { flags: { ...base, name: 'gapped', profile: 'airgapped', up: true, strict: true }, json: true }),
    ).rejects.toMatchObject({ code: 'E_STRICT_HARDENING' })
    expect(driver.builds).toEqual([])
    // The manifest is still written: the environment exists, it just could not start.
    expect(await loadManifest('gapped')).not.toBeNull()
  })

  it('does not apply --strict to a --build-only run, which starts nothing', async () => {
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ networkNone: { support: 'unsupported', note: 'no air-gap here' } }),
    })
    const { result } = await runCommand<{ built: boolean }>(Create, {
      flags: { ...base, name: 'gapped', profile: 'airgapped', build: true, strict: true },
      json: true,
    })
    expect(result?.built).toBe(true)
  })

  it('reports failed tool installs', async () => {
    driver = new FakeDriver({ name: 'docker', runOnceResult: { stdout: 'foundry=fail\n', code: 0 } })
    const { result } = await runCommand<{ failedTools: string[] }>(Create, {
      flags: { ...base, name: 't', framework: ['foundry'], build: true },
      json: true,
    })
    expect(result?.failedTools).toEqual(['foundry'])
  })
})

describe('dcw create (human output)', () => {
  it('prints the created line and a next-step hint', async () => {
    const { logs } = await runCommand(Create, { flags: { ...base, name: 'h' }, json: false })
    expect(logs).toEqual(["Created environment 'h'.", 'Next: dcw up h'])
  })

  it('prints build and start lines, and no next-step hint, for --up', async () => {
    const { logs } = await runCommand(Create, { flags: { ...base, name: 'h', up: true }, json: false })
    expect(logs).toEqual(["Created environment 'h'.", 'Built dcw/h:latest.', 'Started dcw-h.'])
  })

  it('warns about failed tools and about an unreadable tool report', async () => {
    driver = new FakeDriver({ name: 'docker', runOnceResult: { stdout: 'foundry=fail\n', code: 0 } })
    const failed = await runCommand(Create, {
      flags: { ...base, name: 'h', framework: ['foundry'], build: true },
      json: false,
    })
    expect(failed.warns).toEqual(['tools failed to install: foundry'])

    driver = new FakeDriver({ name: 'docker', runOnceResult: { stdout: '', code: 1 } })
    const unverified = await runCommand(Create, {
      flags: { ...base, name: 'h2', framework: ['foundry'], build: true },
      json: false,
    })
    expect(unverified.warns).toEqual(['could not read the in-image tool report; install status is unverified.'])
  })

  it('warns about dropped and caveated hardening when starting', async () => {
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({
        networkNone: { support: 'unsupported', note: 'no air-gap here' },
        capDrop: { support: 'caveated', note: 'partial only' },
      }),
    })
    const { warns } = await runCommand(Create, {
      flags: { ...base, name: 'h', profile: 'airgapped', up: true },
      json: false,
    })
    expect(warns).toContain('dropped [network-none]: no air-gap here')
    expect(warns.some((w) => w.startsWith('note [drop-cap'))).toBe(true)
  })
})

describe('dcw create (interactive wizard)', () => {
  function withTty<T>(fn: () => Promise<T>): Promise<T> {
    const stdin = process.stdin as unknown as { isTTY: boolean | undefined }
    const stdout = process.stdout as unknown as { isTTY: boolean | undefined }
    const prev = [stdin.isTTY, stdout.isTTY] as const
    stdin.isTTY = true
    stdout.isTTY = true
    return fn().finally(() => {
      stdin.isTTY = prev[0]
      stdout.isTTY = prev[1]
    })
  }

  it('mounts the wizard, seeded with the flag input, and persists what it returns', async () => {
    mountWizard.mockResolvedValue({
      name: 'from-wizard',
      engine: 'auto',
      selections: { frameworks: ['foundry'] },
      hardening: ['drop-caps'],
      ssh: true,
    })

    const { result } = await withTty(() =>
      runCommand<{ name: string }>(Create, {
        flags: { ...base, 'no-input': false, name: 'seed', framework: ['ape'] },
        json: false,
      }),
    )

    expect(result?.name).toBe('from-wizard')
    expect(mountWizard).toHaveBeenCalledWith({ initial: expect.objectContaining({ name: 'seed', frameworks: ['ape'] }) })
    expect((await loadManifest('from-wizard'))?.spec.hardening).toEqual(['drop-caps'])
  })

  it('reports E_CANCELLED when the wizard is dismissed', async () => {
    mountWizard.mockResolvedValue(null)
    await expect(
      withTty(() => runCommand(Create, { flags: { ...base, 'no-input': false }, json: false })),
    ).rejects.toMatchObject({ code: 'E_CANCELLED' })
  })

  it('never mounts the wizard under --json, --yes or --no-input', async () => {
    await withTty(() => runCommand(Create, { flags: { ...base, 'no-input': false, name: 'a' }, json: true }))
    await withTty(() => runCommand(Create, { flags: { ...base, 'no-input': false, yes: true, name: 'b' }, json: false }))
    await withTty(() => runCommand(Create, { flags: { ...base, name: 'c' }, json: false }))
    expect(mountWizard).not.toHaveBeenCalled()
  })
})
