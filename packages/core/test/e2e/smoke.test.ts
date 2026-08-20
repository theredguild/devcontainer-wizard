import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const run = promisify(execFile)

// Gated: requires DCW_E2E=1, a built dist, and a working container engine.
const ENABLED = process.env.DCW_E2E === '1'
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const bin = path.join(pkgRoot, 'bin', 'run.js')

describe.skipIf(!ENABLED)('e2e smoke (create → build → up → exec → stop → rm)', () => {
  let env: NodeJS.ProcessEnv
  let configDir: string
  let stateDir: string

  beforeAll(async () => {
    configDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-e2e-cfg-'))
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-e2e-state-'))
    env = { ...process.env, XDG_CONFIG_HOME: configDir, XDG_STATE_HOME: stateDir }
  })

  afterAll(async () => {
    await run('node', [bin, 'rm', 'e2e', '--purge', '--yes'], { env }).catch(() => undefined)
    await fs.rm(configDir, { recursive: true, force: true })
    await fs.rm(stateDir, { recursive: true, force: true })
  })

  it('runs the full lifecycle and lands a vscode shell in /workspace', async () => {
    await run('node', [bin, 'create', '--no-input', '--name', 'e2e', '--harden', 'drop-caps', '--build', '--up', '--json'], {
      env,
      timeout: 540_000,
    })

    const { stdout } = await run('node', [bin, 'exec', 'e2e', '--', 'sh', '-lc', 'echo "$(whoami):$(pwd)"'], { env })
    expect(stdout).toContain('vscode:/workspace')

    const ls = await run('node', [bin, 'ls', '--json'], { env })
    const parsed = JSON.parse(ls.stdout) as { environments: Array<{ name: string; status: string }> }
    expect(parsed.environments.find((e) => e.name === 'e2e')?.status).toBe('running')

    await run('node', [bin, 'stop', 'e2e'], { env })
  }, 600_000)
})
