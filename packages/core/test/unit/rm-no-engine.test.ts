import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dev = path.join(pkgRoot, 'bin', 'dev.js')

let tmp: string
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-rm-'))
  // An empty PATH (plus node's own dir so tsx still runs) means no container
  // engine binary is discoverable — the "Docker was uninstalled" scenario.
  env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(tmp, 'config'),
    XDG_STATE_HOME: path.join(tmp, 'state'),
    PATH: path.dirname(process.execPath),
    NODE_NO_WARNINGS: '1',
  }
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', 'tsx', dev, ...args], { env }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 0
      resolve({ code, stdout, stderr })
    })
  })
}

describe('dcw rm --purge without a usable container engine', () => {
  it('still purges local state instead of stranding the environment', async () => {
    const created = await run(['create', '--no-input', '--name', 'orphan'])
    expect(created.code).toBe(0)

    const manifest = path.join(tmp, 'config', 'dcw', 'environments', 'orphan.json')
    expect(await fs.stat(manifest)).toBeTruthy()

    // Without the fix this fails with E_NO_ENGINE (exit 3) and the manifest stays
    // on disk forever: `ls` shows it, and nothing can delete it.
    const removed = await run(['rm', 'orphan', '--purge', '--yes'])
    expect(removed.code).toBe(0)
    await expect(fs.stat(manifest)).rejects.toThrow()
  })

  it('still refuses a non-purge rm when the engine is unavailable', async () => {
    await run(['create', '--no-input', '--name', 'keeper'])
    const removed = await run(['rm', 'keeper'])
    expect(removed.code).toBe(3)
  })
})
