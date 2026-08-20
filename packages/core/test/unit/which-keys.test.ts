import * as fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'
import { useTempState } from '../helpers/fixtures.js'

const calls: Array<{ bin: string; args: string[] }> = []
let script: Array<{ match: RegExp; result: Partial<CaptureResult> }> = []

vi.mock('../../src/engine/exec.js', () => ({
  capture: async (bin: string, args: string[]): Promise<CaptureResult> => {
    calls.push({ bin, args })
    const hit = script.find((s) => s.match.test(`${bin} ${args.join(' ')}`))
    return { code: 0, stdout: '', stderr: '', spawnError: false, ...(hit?.result ?? {}) }
  },
  inherit: async () => 0,
}))

const { isOnPath } = await import('../../src/util/which.js')
const { ensureKeypair } = await import('../../src/core/ssh/keys.js')

beforeEach(() => {
  calls.length = 0
  script = []
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('isOnPath', () => {
  it('accepts a hit from the POSIX `command -v` builtin', async () => {
    script = [{ match: /^command -v git/, result: { stdout: '/usr/bin/git\n' } }]
    expect(await isOnPath('git')).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('falls back to `which` where `command` is not an executable binary', async () => {
    // Most Linux distros ship no /usr/bin/command, so the first probe spawn-fails.
    script = [
      { match: /^command -v git/, result: { spawnError: true, code: 127 } },
      { match: /^which git/, result: { stdout: '/usr/bin/git\n' } },
    ]
    expect(await isOnPath('git')).toBe(true)
    expect(calls.map((c) => c.bin)).toEqual(['command', 'which'])
  })

  it('falls back when `command` succeeds but prints nothing', async () => {
    script = [{ match: /^which git/, result: { stdout: '/usr/bin/git\n' } }]
    expect(await isOnPath('git')).toBe(true)
  })

  it('reports false when neither probe resolves the binary', async () => {
    script = [
      { match: /^command -v nope/, result: { code: 1 } },
      { match: /^which nope/, result: { code: 1 } },
    ]
    expect(await isOnPath('nope')).toBe(false)
  })

  it('reports false when `which` exits 0 but prints nothing', async () => {
    script = [{ match: /^command -v nope/, result: { code: 1 } }]
    expect(await isOnPath('nope')).toBe(false)
  })
})

describe('ensureKeypair failure handling', () => {
  let state: Awaited<ReturnType<typeof useTempState>>

  beforeEach(async () => {
    state = await useTempState('dcw-keys-fail-')
  })

  afterEach(async () => {
    await state.cleanup()
  })

  it('points at OpenSSH when ssh-keygen is not installed', async () => {
    script = [{ match: /^ssh-keygen/, result: { spawnError: true, code: 127 } }]
    await expect(ensureKeypair()).rejects.toThrow(
      'ssh-keygen not found on PATH; install OpenSSH to use `dcw attach`.',
    )
  })

  it('surfaces the ssh-keygen error when generation fails', async () => {
    script = [{ match: /^ssh-keygen/, result: { code: 1, stderr: 'no space left on device\n' } }]
    await expect(ensureKeypair()).rejects.toThrow('Failed to generate dcw SSH key: no space left on device.')
  })

  it('reports the exit code when ssh-keygen said nothing', async () => {
    script = [{ match: /^ssh-keygen/, result: { code: 5 } }]
    await expect(ensureKeypair()).rejects.toThrow('Failed to generate dcw SSH key: exit 5.')
  })

  it('regenerates when only one half of the pair survives', async () => {
    const { sshDir } = await import('../../src/state/paths.js')
    await fs.mkdir(sshDir(), { recursive: true })
    // A private key with no matching .pub must not be reused as-is.
    await fs.writeFile(`${sshDir()}/id_ed25519`, 'stale')
    script = [{ match: /^ssh-keygen/, result: { code: 1, stderr: 'boom' } }]
    await expect(ensureKeypair()).rejects.toThrow('Failed to generate dcw SSH key')
    expect(calls.some((c) => c.bin === 'ssh-keygen')).toBe(true)
  })
})
