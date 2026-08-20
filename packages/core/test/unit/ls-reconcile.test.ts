import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dev = path.join(pkgRoot, 'bin', 'dev.js')

let tmp: string
let baseEnv: NodeJS.ProcessEnv

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-ls-'))
  baseEnv = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(tmp, 'config'),
    XDG_STATE_HOME: path.join(tmp, 'state'),
    NODE_NO_WARNINGS: '1',
  }
})

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true })
})

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', 'tsx', dev, ...args], { env }, (err, stdout) => {
      const code = err && typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 0
      resolve({ code, stdout })
    })
  })
}

describe('dcw ls status reconciliation', () => {
  it("reports 'unknown', not 'absent', when the engine cannot be reached", async () => {
    await run(['create', '--no-input', '--name', 'ghost'], baseEnv)

    // Mark the env as having had a container, then make the engine unreachable.
    const file = path.join(tmp, 'config', 'dcw', 'environments', 'ghost.json')
    const m = JSON.parse(await fs.readFile(file, 'utf8'))
    m.engine = 'docker'
    m.image = { tag: 'dcw/ghost:latest', imageId: 'sha256:x', containerfileHash: 'h', builtAt: m.createdAt }
    m.container = { id: 'cid', name: 'dcw-ghost', status: 'running', startedAt: m.createdAt, appliedFlags: [], droppedHardening: [] }
    await fs.writeFile(file, JSON.stringify(m, null, 2))

    // Empty PATH (bar node itself) => no container engine binary is discoverable.
    const noEngine = { ...baseEnv, PATH: path.dirname(process.execPath) }
    const { stdout } = await run(['ls', '--json'], noEngine)
    const parsed = JSON.parse(stdout) as { environments: Array<{ name: string; status: string }> }
    const ghost = parsed.environments.find((e) => e.name === 'ghost')!

    // 'absent' would assert the container is gone; we simply cannot tell.
    expect(ghost.status).toBe('unknown')
  })

  it("still reports 'never-started' for an env that was never brought up", async () => {
    await run(['create', '--no-input', '--name', 'fresh'], baseEnv)
    const noEngine = { ...baseEnv, PATH: path.dirname(process.execPath) }
    const { stdout } = await run(['ls', '--json'], noEngine)
    const parsed = JSON.parse(stdout) as { environments: Array<{ name: string; status: string }> }
    expect(parsed.environments.find((e) => e.name === 'fresh')?.status).toBe('never-started')
  })
})
