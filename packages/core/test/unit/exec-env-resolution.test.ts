import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub the engine-touching exec and the env-name resolver so we can assert how
// `dcw exec` splits its argv into <env-name> + <command> without a container.
const execInto = vi.fn(async () => 0)
const resolveEnvName = vi.fn(async (positional?: string) => positional ?? 'sole')

vi.mock('../../src/cli/context.js', () => ({ execInto, resolveEnvName }))

// Control which env names "exist" for the first-token-is-env-name decision.
const listManifests = vi.fn(async () => [{ name: 'myenv' }])
vi.mock('../../src/state/store.js', () => ({ listManifests }))

const { default: Exec } = await import('../../src/commands/exec.js')

/** Drive Exec.run with a given argv, bypassing oclif's Config-backed parse. */
async function runExec(argv: string[]): Promise<void> {
  const cmd = Object.create(Exec.prototype) as InstanceType<typeof Exec>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(cmd as any).parse = async () => ({ argv, flags: {} })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(cmd as any).exit = () => {}
  await cmd.run()
}

beforeEach(() => {
  execInto.mockClear()
  resolveEnvName.mockClear()
  listManifests.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exec env-name resolution (#bug1)', () => {
  it('treats the sole token as the command when it is not an existing env (`exec -- forge --version`)', async () => {
    await runExec(['forge', '--version'])
    expect(resolveEnvName).toHaveBeenCalledWith(undefined)
    expect(execInto).toHaveBeenCalledWith(expect.objectContaining({ cmd: ['forge', '--version'] }))
  })

  it('treats the first token as the env name when it names an existing env (`exec myenv -- cmd`)', async () => {
    await runExec(['myenv', 'ls', '-la'])
    expect(resolveEnvName).toHaveBeenCalledWith('myenv')
    expect(execInto).toHaveBeenCalledWith(expect.objectContaining({ name: 'myenv', cmd: ['ls', '-la'] }))
  })

  it('never mistakes a flag-leading token for an env name', async () => {
    await runExec(['--help'])
    expect(resolveEnvName).toHaveBeenCalledWith(undefined)
    expect(execInto).toHaveBeenCalledWith(expect.objectContaining({ cmd: ['--help'] }))
  })

  it('defaults to the sole env with an empty command when no args are given', async () => {
    await runExec([])
    expect(resolveEnvName).toHaveBeenCalledWith(undefined)
    expect(execInto).toHaveBeenCalledWith(expect.objectContaining({ cmd: [] }))
  })
})
