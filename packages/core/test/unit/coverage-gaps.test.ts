import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG, validValuesFor, type SelectionKey } from '../../src/domain/catalog.js'
import { getProfile, isProfileKey, recipesToHardening } from '../../src/domain/profiles.js'
import { hardeningToEffects, tmpfsSizeBytes } from '../../src/hardening/effects.js'
import { emitFlags, flagNeedsUserns } from '../../src/hardening/flag-emitters.js'
import { generateContainerfile } from '../../src/containerfile/generate.js'
import { parseInstructions } from '../../src/containerfile/guard.js'
import { configHome, stateHome } from '../../src/state/paths.js'
import { useTempState } from '../helpers/fixtures.js'

describe('catalog lookup', () => {
  it('returns the option values for a known category', () => {
    expect(validValuesFor('coreLanguages')).toEqual(['rust', 'python', 'go', 'node'])
  })

  it('returns an empty list for a category that does not exist', () => {
    expect(validValuesFor('nope' as SelectionKey)).toEqual([])
  })
})

describe('profiles', () => {
  it('recognizes the shipped profile keys and rejects others', () => {
    expect(isProfileKey('hardened')).toBe(true)
    expect(isProfileKey('none')).toBe(false)
    expect(isProfileKey('nonsense')).toBe(false)
  })

  it('looks a profile definition up by key', () => {
    expect(getProfile('hardened')?.label).toBeTruthy()
    expect(getProfile('nonsense')).toBeUndefined()
  })

  it('ignores unknown keys when expanding profiles', () => {
    expect(recipesToHardening(['nonsense'])).toEqual([])
    expect(recipesToHardening(['hardened', 'nonsense'])).toEqual(recipesToHardening(['hardened']))
  })
})

describe('hardeningToEffects precedence', () => {
  it('emits only --cap-drop=ALL when both drop-caps and no-raw-packets are requested', () => {
    // ALL subsumes NET_RAW; emitting both would be redundant noise on the CLI.
    const effects = hardeningToEffects(['drop-caps', 'no-raw-packets'])
    expect(effects.filter((e) => e.kind === 'drop-cap')).toEqual([{ kind: 'drop-cap', cap: 'ALL' }])
  })

  it('drops NET_RAW alone when capabilities are otherwise kept', () => {
    expect(hardeningToEffects(['no-raw-packets'])).toContainEqual({ kind: 'drop-cap', cap: 'NET_RAW' })
  })

  it('lets a full air-gap supersede IPv6 sysctl tuning', () => {
    const effects = hardeningToEffects(['network-none', 'disable-ipv6'])
    expect(effects).toContainEqual({ kind: 'network-none' })
    expect(effects.some((e) => e.kind === 'sysctl')).toBe(false)
  })

  it('tunes IPv6 off via sysctls when there is no air-gap', () => {
    const keys = hardeningToEffects(['disable-ipv6']).flatMap((e) => (e.kind === 'sysctl' ? [e.key] : []))
    expect(keys).toEqual(['net.ipv6.conf.all.disable_ipv6', 'net.ipv6.conf.default.disable_ipv6'])
  })

  it('records vscode-security as an explicit no-op with a reason', () => {
    expect(hardeningToEffects(['vscode-security'])).toEqual([
      {
        kind: 'noop',
        source: 'vscode-security',
        reason: 'Editor hardening has no effect in shell-first mode (no devcontainer/VS Code integration).',
      },
    ])
  })

  it('emits nothing for an empty selection', () => {
    expect(hardeningToEffects([])).toEqual([])
  })
})

describe('tmpfsSizeBytes', () => {
  it('converts every size suffix the tmpfs option syntax allows', () => {
    expect(tmpfsSizeBytes('rw,size=512k')).toBe(512 * 1024)
    expect(tmpfsSizeBytes('rw,size=512m')).toBe(512 * 1024 ** 2)
    expect(tmpfsSizeBytes('rw,size=2g')).toBe(2 * 1024 ** 3)
    // A bare byte count carries no suffix.
    expect(tmpfsSizeBytes('rw,size=4096')).toBe(4096)
  })

  it('is case-insensitive about the suffix', () => {
    expect(tmpfsSizeBytes('rw,size=1G')).toBe(1024 ** 3)
    expect(tmpfsSizeBytes('rw,size=1M')).toBe(1024 ** 2)
  })

  it('treats an unbounded tmpfs as infinitely large, so it never wins the dedupe', () => {
    expect(tmpfsSizeBytes('rw,noexec,nosuid')).toBe(Number.POSITIVE_INFINITY)
  })

  it('keeps the most restrictive mount when two options target the same path', () => {
    // readonly-os mounts /tmp at 1g; secure-tmp mounts it at 512m. Emitting both
    // is non-deterministic, so the smaller one must survive, in place.
    const tmp = hardeningToEffects(['readonly-os', 'secure-tmp']).filter(
      (e) => e.kind === 'tmpfs' && e.target === '/tmp',
    )
    expect(tmp).toHaveLength(1)
    expect(tmp[0]).toMatchObject({ opts: expect.stringContaining('size=512m') })
  })
})

describe('flag emitters', () => {
  it('emits engine-correct flags for every effect kind', () => {
    expect(emitFlags({ kind: 'drop-cap', cap: 'ALL' }, 'docker')).toEqual(['--cap-drop=ALL'])
    expect(emitFlags({ kind: 'no-new-privs' }, 'docker')).toEqual(['--security-opt', 'no-new-privileges:true'])
    expect(emitFlags({ kind: 'apparmor', profile: 'docker-default' }, 'docker')).toEqual([
      '--security-opt',
      'apparmor=docker-default',
    ])
    expect(emitFlags({ kind: 'network-none' }, 'docker')).toEqual(['--network=none'])
    expect(emitFlags({ kind: 'sysctl', key: 'k', value: 'v' }, 'docker')).toEqual(['--sysctl', 'k=v'])
    expect(emitFlags({ kind: 'dns', servers: ['1.1.1.1', '1.0.0.1'] }, 'docker')).toEqual([
      '--dns',
      '1.1.1.1',
      '--dns',
      '1.0.0.1',
    ])
    expect(emitFlags({ kind: 'resources', memory: '2g', cpus: '4' }, 'docker')).toEqual([
      '--memory',
      '2g',
      '--cpus',
      '4',
    ])
    expect(emitFlags({ kind: 'noop', source: 'vscode-security', reason: 'y' }, 'docker')).toEqual([])
  })

  it('recognizes uid-mapped tmpfs flags, which rootless podman must remap', () => {
    expect(flagNeedsUserns('/workspace:rw,uid=1000,gid=1000')).toBe(true)
    expect(flagNeedsUserns('/tmp:rw,noexec,nosuid')).toBe(false)
  })
})

describe('containerfile instruction parsing', () => {
  it('keeps comments and blank lines as verbatim passthrough chunks, not instructions', () => {
    const parsed = parseInstructions('# a comment\n\n   \nRUN echo hi')
    expect(parsed.map((i) => i.isRun)).toEqual([false, false, false, true])
    expect(parsed.at(-1)?.lines).toEqual(['RUN echo hi'])
  })

  it('joins a backslash continuation into a single instruction', () => {
    const parsed = parseInstructions('RUN set -e \\\n  && echo hi\nWORKDIR /workspace')
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({ isRun: true, lines: ['RUN set -e \\', '  && echo hi'] })
    expect(parsed[1]).toMatchObject({ isRun: false, lines: ['WORKDIR /workspace'] })
  })

  it('recognizes every Dockerfile directive dcw emits', () => {
    const directives = ['RUN', 'ENV', 'WORKDIR', 'USER', 'COPY', 'ADD', 'ARG', 'LABEL', 'SHELL', 'ENTRYPOINT', 'CMD', 'FROM']
    for (const d of directives) {
      expect(parseInstructions(`${d} x`)[0]?.isRun).toBe(d === 'RUN')
    }
    // An unknown leading word is passthrough, never treated as an instruction.
    expect(parseInstructions('NOTADIRECTIVE x')[0]?.isRun).toBe(false)
  })

  it('clones the default branch when none is pinned', () => {
    const cf = generateContainerfile({
      selections: {},
      gitRepository: { enabled: true, url: 'https://github.com/foo/bar' },
      ssh: false,
    })
    expect(cf).toContain('git clone https://github.com/foo/bar /home/vscode/repos/')
    expect(cf).not.toContain('--branch')
  })

  it('skips the clone step entirely for a disabled git repository', () => {
    const cf = generateContainerfile({
      selections: {},
      gitRepository: { enabled: false, url: 'https://github.com/foo/bar' },
      ssh: false,
    })
    expect(cf).not.toContain('git clone')
  })

  it('generates a Containerfile for every catalog tool, so no snippet is missing', () => {
    for (const category of CATALOG) {
      for (const item of category.items) {
        expect(() =>
          generateContainerfile({ selections: { [category.key]: [item.value] }, ssh: true }),
        ).not.toThrow()
      }
    }
  })
})

describe('state paths', () => {
  let state: Awaited<ReturnType<typeof useTempState>>

  beforeEach(async () => {
    state = await useTempState('dcw-paths-')
  })

  afterEach(async () => {
    await state.cleanup()
  })

  it('honors the XDG environment variables when they are set', () => {
    expect(configHome()).toBe(path.join(state.dir, 'config'))
    expect(stateHome()).toBe(path.join(state.dir, 'state'))
  })

  it('falls back to the conventional home-relative directories', async () => {
    const os = await import('node:os')
    delete process.env.XDG_CONFIG_HOME
    delete process.env.XDG_STATE_HOME
    expect(configHome()).toBe(path.join(os.homedir(), '.config'))
    expect(stateHome()).toBe(path.join(os.homedir(), '.local', 'state'))
  })
})

describe('manifest store failure handling', () => {
  let state: Awaited<ReturnType<typeof useTempState>>

  beforeEach(async () => {
    state = await useTempState('dcw-store-')
  })

  afterEach(async () => {
    await state.cleanup()
    vi.restoreAllMocks()
  })

  it('propagates a read error that is not "file missing"', async () => {
    const { loadManifest } = await import('../../src/state/store.js')
    const { manifestPath } = await import('../../src/state/paths.js')
    // A directory where the manifest should be: EISDIR, not ENOENT — a real
    // failure that must surface rather than read as "no such environment".
    await fs.mkdir(manifestPath('env1'), { recursive: true })
    await expect(loadManifest('env1')).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it('propagates a listing error that is not "directory missing"', async () => {
    const { listManifests } = await import('../../src/state/store.js')
    const { environmentsDir } = await import('../../src/state/paths.js')
    await fs.mkdir(path.dirname(environmentsDir()), { recursive: true })
    await fs.writeFile(environmentsDir(), 'not a directory')
    await expect(listManifests()).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it('returns an empty list when the environments directory does not exist yet', async () => {
    const { listManifests } = await import('../../src/state/store.js')
    expect(await listManifests()).toEqual([])
  })

  it('skips non-JSON files when listing', async () => {
    const { listManifests, saveManifest } = await import('../../src/state/store.js')
    const { environmentsDir } = await import('../../src/state/paths.js')
    const { manifest } = await import('../helpers/fixtures.js')
    await saveManifest(manifest({ name: 'real' }))
    await fs.writeFile(path.join(environmentsDir(), 'README.txt'), 'not a manifest')
    expect((await listManifests()).map((m) => m.name)).toEqual(['real'])
  })
})
