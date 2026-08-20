import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'

let captureResult: Partial<CaptureResult> = {}
const captureCalls: Array<{ bin: string; args: string[] }> = []

vi.mock('../../src/engine/exec.js', () => ({
  capture: async (bin: string, args: string[]): Promise<CaptureResult> => {
    captureCalls.push({ bin, args })
    return { code: 0, stdout: '', stderr: '', spawnError: false, ...captureResult }
  },
  inherit: async () => 0,
}))

const { describeHost, detectHost } = await import('../../src/engine/host.js')

function withPlatform(platform: NodeJS.Platform, arch: string, fn: () => Promise<void>): Promise<void> {
  const prev = { platform: process.platform, arch: process.arch }
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  Object.defineProperty(process, 'arch', { value: arch, configurable: true })
  return fn().finally(() => {
    Object.defineProperty(process, 'platform', { value: prev.platform, configurable: true })
    Object.defineProperty(process, 'arch', { value: prev.arch, configurable: true })
  })
}

beforeEach(() => {
  captureCalls.length = 0
  captureResult = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('detectHost', () => {
  it('maps each supported platform and architecture', async () => {
    await withPlatform('linux', 'x64', async () => {
      expect(await detectHost()).toEqual({ os: 'linux', arch: 'x64' })
    })
    await withPlatform('win32', 'arm64', async () => {
      expect(await detectHost()).toEqual({ os: 'windows', arch: 'arm64' })
    })
    await withPlatform('freebsd', 'ppc64', async () => {
      expect(await detectHost()).toEqual({ os: 'other', arch: 'other' })
    })
  })

  it('reads the major macOS version from sw_vers', async () => {
    captureResult = { stdout: '15.6.1\n' }
    await withPlatform('darwin', 'arm64', async () => {
      expect(await detectHost()).toEqual({ os: 'macos', arch: 'arm64', macosMajor: 15 })
    })
    expect(captureCalls).toEqual([{ bin: 'sw_vers', args: ['-productVersion'] }])
  })

  it('omits the version rather than guessing when sw_vers fails or is unparseable', async () => {
    for (const result of [
      { spawnError: true, code: 127 },
      { code: 1 },
      { stdout: 'not-a-version\n' },
      { stdout: '\n' },
    ]) {
      captureResult = result
      await withPlatform('darwin', 'arm64', async () => {
        expect(await detectHost()).toEqual({ os: 'macos', arch: 'arm64' })
      })
    }
  })

  it('never probes sw_vers off macOS', async () => {
    await withPlatform('linux', 'x64', async () => {
      await detectHost()
    })
    expect(captureCalls).toEqual([])
  })
})

describe('describeHost', () => {
  it('labels each OS, including the macOS major version when known', () => {
    expect(describeHost({ os: 'macos', arch: 'arm64', macosMajor: 15 })).toBe('macOS 15 (arm64)')
    expect(describeHost({ os: 'macos', arch: 'x64' })).toBe('macOS (x64)')
    expect(describeHost({ os: 'linux', arch: 'x64' })).toBe('Linux (x64)')
    expect(describeHost({ os: 'windows', arch: 'x64' })).toBe('Windows (x64)')
    expect(describeHost({ os: 'other', arch: 'other' })).toBe('unknown OS (other)')
  })
})
