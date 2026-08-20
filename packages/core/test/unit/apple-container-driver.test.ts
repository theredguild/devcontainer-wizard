import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'

const captured: Array<{ bin: string; args: string[] }> = []
let script: Array<{ match: RegExp; result: Partial<CaptureResult> }> = []

vi.mock('../../src/engine/exec.js', () => ({
  capture: async (bin: string, args: string[]): Promise<CaptureResult> => {
    captured.push({ bin, args })
    const hit = script.find((s) => s.match.test(`${bin} ${args.join(' ')}`))
    return { code: 0, stdout: '', stderr: '', spawnError: false, ...(hit?.result ?? {}) }
  },
  inherit: async () => 0,
}))

const { AppleContainerDriver } = await import('../../src/engine/drivers/apple-container.js')

const argv = (i: { bin: string; args: string[] }) => `${i.bin} ${i.args.join(' ')}`

beforeEach(() => {
  captured.length = 0
  script = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppleContainerDriver.detect', () => {
  it('reports the CLI version and probes the service with `container list`', async () => {
    script = [{ match: /container --version/, result: { stdout: 'container CLI version 1.0.0\nbuild x\n' } }]
    expect(await new AppleContainerDriver().detect()).toEqual({
      available: true,
      version: 'container CLI version 1.0.0',
    })
    expect(captured.map(argv)).toEqual(['container --version', 'container list'])
  })

  it('reports the CLI as missing when it cannot be spawned', async () => {
    script = [{ match: /container --version/, result: { spawnError: true, code: 127 } }]
    expect(await new AppleContainerDriver().detect()).toEqual({
      available: false,
      reason: '`container` CLI not found on PATH.',
    })
  })

  it("surfaces the service's own error when it is not running", async () => {
    script = [{ match: /container list/, result: { code: 1, stderr: 'XPC connection error\n' } }]
    expect(await new AppleContainerDriver().detect()).toMatchObject({
      available: false,
      reason: 'XPC connection error',
    })
  })

  it('falls back to a generic reason when the failing probe said nothing', async () => {
    script = [{ match: /container list/, result: { code: 1 } }]
    expect(await new AppleContainerDriver().detect()).toMatchObject({
      reason: 'Apple Containers service is not running.',
    })
  })
})

describe('AppleContainerDriver.ps', () => {
  const rows = JSON.stringify([
    { id: 'dcw-a', status: { state: 'running' }, configuration: { labels: { 'dcw.env': 'a' }, image: { reference: 'img' } } },
    { id: 'buildkit', status: { state: 'stopped' }, configuration: { labels: {}, image: { reference: 'b' } } },
  ])

  it('uses Apple\'s `list --format json`, which has no --filter flag', async () => {
    script = [{ match: /container list/, result: { stdout: rows } }]
    const res = await new AppleContainerDriver().ps()
    expect(argv(captured[0]!)).toBe('container list --format json --all')
    expect(res.map((c) => c.id)).toEqual(['dcw-a', 'buildkit'])
  })

  it('omits --all when stopped containers are not wanted', async () => {
    await new AppleContainerDriver().ps({ all: false })
    expect(argv(captured[0]!)).toBe('container list --format json')
  })

  it('applies the label filter client-side', async () => {
    script = [{ match: /container list/, result: { stdout: rows } }]
    const res = await new AppleContainerDriver().ps({ label: 'dcw.env=a' })
    expect(res.map((c) => c.id)).toEqual(['dcw-a'])
  })

  it('returns an empty list when the service is unreachable', async () => {
    script = [{ match: /container list/, result: { code: 1 } }]
    expect(await new AppleContainerDriver().ps()).toEqual([])
  })
})

describe('AppleContainerDriver verbs', () => {
  it('renames rm to `delete` and ps to `list`', async () => {
    const driver = new AppleContainerDriver()
    await driver.rm('dcw-a', { force: true })
    expect(argv(captured[0]!)).toBe('container delete -f dcw-a')
  })
})
