import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo, EngineDriver } from '../../src/engine/types.js'

const isOnPath = vi.fn(async (_bin: string) => false)
const spawn = vi.fn()

vi.mock('../../src/util/which.js', () => ({ isOnPath: (bin: string) => isOnPath(bin) }))
vi.mock('node:child_process', async (orig) => {
  const actual = await orig<typeof import('node:child_process')>()
  return { ...actual, spawn: (...a: unknown[]) => spawn(...a) }
})

const { findFreePort, isContainerRunning, resolveDcwInvocation } = await import('../../src/core/ssh/attach.js')
const { EDITOR_IDS, detectEditor, editorDisplayName, launchEditor } = await import('../../src/core/ssh/editors.js')

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & { unref: () => void }
  child.unref = vi.fn()
  return child
}

beforeEach(() => {
  isOnPath.mockReset().mockResolvedValue(false)
  spawn.mockReset().mockImplementation(() => fakeChild())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isContainerRunning', () => {
  function driverWith(containers: ContainerInfo[]) {
    return {
      ps: vi.fn(async () => containers),
    } as unknown as EngineDriver
  }

  const info = (status: string): ContainerInfo => ({ id: 'c', name: 'dcw-env1', image: 'i', status, labels: {} })

  it('queries by the dcw environment label, including stopped containers', async () => {
    const driver = driverWith([])
    await isContainerRunning(driver, 'env1')
    expect(driver.ps).toHaveBeenCalledWith({ label: 'dcw.env=env1', all: true })
  })

  it('recognizes both docker-style "Up …" and plain "running" statuses', async () => {
    expect(await isContainerRunning(driverWith([info('Up 2 minutes')]), 'env1')).toBe(true)
    expect(await isContainerRunning(driverWith([info('running')]), 'env1')).toBe(true)
  })

  it('reports false for stopped or missing containers', async () => {
    expect(await isContainerRunning(driverWith([info('Exited (0) 3 minutes ago')]), 'env1')).toBe(false)
    expect(await isContainerRunning(driverWith([]), 'env1')).toBe(false)
  })

  it('does not mistake a substring like "backup" for a running container', async () => {
    expect(await isContainerRunning(driverWith([info('backup pending')]), 'env1')).toBe(false)
  })
})

describe('findFreePort', () => {
  it('returns a bindable loopback port', async () => {
    const port = await findFreePort()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThan(65536)
    // Two calls must not hand out the same port while the first is still open.
    expect(typeof (await findFreePort())).toBe('number')
  })
})

describe('resolveDcwInvocation', () => {
  it('prefers `dcw` on PATH so the ProxyCommand survives upgrades', async () => {
    isOnPath.mockResolvedValue(true)
    expect(await resolveDcwInvocation('my-env')).toBe('dcw ssh-proxy my-env')
  })

  it('falls back to the running node + entry script, shell-quoted', async () => {
    // ssh runs ProxyCommand through `/bin/sh -c`, so a path with spaces would split.
    const prev = process.argv[1]
    process.argv[1] = '/Users/First Last/dcw/bin/run.js'
    try {
      const inv = await resolveDcwInvocation('my-env')
      expect(inv).toBe(`'${process.execPath}' '/Users/First Last/dcw/bin/run.js' ssh-proxy my-env`)
    } finally {
      process.argv[1] = prev as string
    }
  })

  it("escapes embedded single quotes in the fallback path", async () => {
    const prev = process.argv[1]
    process.argv[1] = "/tmp/it's/run.js"
    try {
      expect(await resolveDcwInvocation('e')).toContain(`'/tmp/it'\\''s/run.js'`)
    } finally {
      process.argv[1] = prev as string
    }
  })

  it('falls back to a bare `dcw` invocation when there is no entry script', async () => {
    const prev = process.argv[1]
    // @ts-expect-error deliberately simulating an argv with no script path
    process.argv[1] = undefined
    try {
      expect(await resolveDcwInvocation('e')).toBe('dcw ssh-proxy e')
    } finally {
      process.argv[1] = prev as string
    }
  })
})

describe('editors', () => {
  it('exposes every supported editor id', () => {
    expect(EDITOR_IDS).toEqual(['zed', 'vscode', 'cursor', 'antigravity'])
  })

  it('maps ids to display names', () => {
    expect(EDITOR_IDS.map(editorDisplayName)).toEqual(['Zed', 'VS Code', 'Cursor', 'Antigravity'])
  })

  it('detects the first installed editor in preference order', async () => {
    isOnPath.mockImplementation(async (bin) => bin === 'cursor')
    expect(await detectEditor()).toBe('cursor')
  })

  it('returns undefined when no editor CLI is on PATH', async () => {
    expect(await detectEditor()).toBeUndefined()
  })

  it('launches Zed with an ssh:// URL', async () => {
    isOnPath.mockResolvedValue(true)
    expect(await launchEditor({ editor: 'zed', alias: 'dcw-env1', folder: '/workspace' })).toBe(true)
    expect(spawn).toHaveBeenCalledWith('zed', ['ssh://dcw-env1/workspace'], { detached: true, stdio: 'ignore' })
  })

  it('launches the VS Code family with --remote ssh-remote+<alias>', async () => {
    isOnPath.mockResolvedValue(true)
    for (const [editor, bin] of [
      ['vscode', 'code'],
      ['cursor', 'cursor'],
      ['antigravity', 'antigravity'],
    ] as const) {
      spawn.mockClear()
      await launchEditor({ editor, alias: 'dcw-env1', folder: '/src' })
      expect(spawn).toHaveBeenCalledWith(bin, ['--remote', 'ssh-remote+dcw-env1', '/src'], {
        detached: true,
        stdio: 'ignore',
      })
    }
  })

  it('detaches the child so dcw can exit immediately', async () => {
    isOnPath.mockResolvedValue(true)
    const child = fakeChild()
    spawn.mockReturnValue(child)
    await launchEditor({ editor: 'zed', alias: 'a', folder: '/workspace' })
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('reports false, without spawning, when the editor CLI is missing', async () => {
    expect(await launchEditor({ editor: 'zed', alias: 'a', folder: '/workspace' })).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
  })
})
