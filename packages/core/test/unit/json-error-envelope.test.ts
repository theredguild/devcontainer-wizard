import { execFile } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dev = path.join(pkgRoot, 'bin', 'dev.js')

/** Run the CLI and capture stdout/stderr/exit code without throwing on failure. */
function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', dev, ...args],
      { env: { ...process.env, NODE_NO_WARNINGS: '1' }, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 0
        resolve({ code, stdout, stderr })
      },
    )
  })
}

describe('--json error envelope for usage errors', () => {
  it('emits a compact {error:{code,message}} envelope for an unknown flag', async () => {
    const { code, stdout } = await run(['ls', '--json', '--definitely-not-a-flag'])

    const parsed = JSON.parse(stdout) as { error: { code: string; message: string } }
    expect(typeof parsed.error.code).toBe('string')
    expect(typeof parsed.error.message).toBe('string')
    expect(parsed.error.message).toMatch(/definitely-not-a-flag/)
    // Usage errors must use the documented UsageError code, not a generic 1.
    expect(code).toBe(2)
  })

  it('does not leak oclif internals (config, home dir, plugin list) into stdout', async () => {
    const { stdout } = await run(['ls', '--json', '--definitely-not-a-flag'])
    // The raw oclif error object serialized to ~120 kB of internal state.
    expect(stdout.length).toBeLessThan(4096)
    expect(stdout).not.toContain('userAgent')
    expect(stdout).not.toContain('plugins')
    expect(stdout).not.toContain('shell')
  })

  it('uses the same envelope for an invalid --engine value', async () => {
    const { code, stdout } = await run(['ls', '--json', '--engine', 'bogus-engine'])
    const parsed = JSON.parse(stdout) as { error: { code: string; message: string } }
    expect(parsed.error.code).toBeTruthy()
    expect(parsed.error.message).toMatch(/bogus-engine/)
    expect(code).toBe(2)
  })

  it('keeps stdout free of the envelope when --json is absent', async () => {
    const { code, stdout, stderr } = await run(['ls', '--definitely-not-a-flag'])
    expect(stdout).not.toContain('"error"')
    expect(stderr.length).toBeGreaterThan(0)
    expect(code).toBe(2)
  })
})
