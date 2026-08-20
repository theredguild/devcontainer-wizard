import { Errors } from '@oclif/core'
import { describe, expect, it } from 'vitest'
import { BaseCommand } from '../../src/base-command.js'
import {
  CancelledError,
  DcwError,
  EngineDnsError,
  EngineUnavailableError,
  EngineUnsupportedError,
  ExitCode,
  NoEngineError,
  NotFoundError,
  StrictHardeningError,
  ValidationError,
} from '../../src/errors.js'
import { ExitSignal, harness } from '../helpers/command.js'

class Probe extends BaseCommand {
  async run(): Promise<void> {}
}

/** Drive the protected `catch` hook the way oclif's runner does. */
async function catchWith(err: Error, json: boolean) {
  const h = harness(Probe, { json })
  // oclif's own fallback handler sets process.exitCode; keep it out of the runner.
  const prevExitCode = process.exitCode
  try {
    await (h.cmd as unknown as { catch(e: Error): Promise<unknown> }).catch(err)
    return { ...h, exitCode: undefined as number | undefined, thrown: undefined as unknown }
  } catch (thrown) {
    if (thrown instanceof ExitSignal) return { ...h, exitCode: thrown.code, thrown: undefined }
    return { ...h, exitCode: undefined, thrown }
  } finally {
    process.exitCode = prevExitCode
  }
}

describe('exit codes', () => {
  it('assigns each domain error its documented exit code and machine code', () => {
    const cases: Array<[DcwError, number, string]> = [
      [new DcwError('x'), ExitCode.GenericError, 'E_GENERIC'],
      [new NoEngineError('x'), ExitCode.NoEngine, 'E_NO_ENGINE'],
      [new EngineUnsupportedError('x'), ExitCode.EngineUnsupported, 'E_ENGINE_UNSUPPORTED'],
      [new EngineUnavailableError('x'), ExitCode.EngineUnavailable, 'E_ENGINE_UNAVAILABLE'],
      [new EngineDnsError('x'), ExitCode.EngineDns, 'E_ENGINE_DNS'],
      [new StrictHardeningError('x'), ExitCode.StrictHardening, 'E_STRICT_HARDENING'],
      [new NotFoundError('x'), ExitCode.NotFound, 'E_NOT_FOUND'],
      [new ValidationError('x'), ExitCode.ValidationError, 'E_VALIDATION'],
      [new CancelledError(), ExitCode.Cancelled, 'E_CANCELLED'],
    ]
    for (const [err, exitCode, code] of cases) {
      expect([err.exitCode, err.code]).toEqual([exitCode, code])
      expect(err).toBeInstanceOf(DcwError)
    }
  })

  it('gives each error class its own name and a default cancel message', () => {
    expect(new NoEngineError('x').name).toBe('NoEngineError')
    expect(new EngineDnsError('x').name).toBe('EngineDnsError')
    expect(new CancelledError().message).toBe('Cancelled.')
    expect(new CancelledError('user quit').message).toBe('user quit')
  })
})

describe('BaseCommand.catch', () => {
  it('emits a {error:{code,message}} envelope and the domain exit code under --json', async () => {
    const res = await catchWith(new NotFoundError("Environment 'x' not found."), true)
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_NOT_FOUND', message: "Environment 'x' not found." } }])
    expect(res.exitCode).toBe(ExitCode.NotFound)
  })

  it('raises human text carrying the same exit and machine code without --json', async () => {
    const res = await catchWith(new ValidationError('bad name'), false)
    expect(res.jsonLogs).toEqual([])
    expect(res.thrown).toMatchObject({ message: 'bad name', exit: ExitCode.ValidationError, code: 'E_VALIDATION' })
  })

  it('honors the --json contract for oclif usage errors instead of dumping its internals', async () => {
    const err = new Errors.CLIError('Nonexistent flag: --nope')
    err.oclif = { exit: ExitCode.UsageError }

    const res = await catchWith(err, true)

    // Left to oclif this serializes the entire CLIError — config, home dir, plugin
    // list — to stdout with no code/message.
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_USAGE', message: 'Nonexistent flag: --nope' } }])
    expect(res.exitCode).toBe(ExitCode.UsageError)
  })

  it('labels a non-usage CLI error E_CLI and keeps its own exit code', async () => {
    const err = new Errors.CLIError('something CLI-ish')
    err.oclif = { exit: 4 }
    const res = await catchWith(err, true)
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_CLI', message: 'something CLI-ish' } }])
    expect(res.exitCode).toBe(4)
  })

  it('defaults to the usage exit code when oclif attached none', async () => {
    const err = new Errors.CLIError('no exit attached')
    err.oclif = {} as never
    const res = await catchWith(err, true)
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_USAGE', message: 'no exit attached' } }])
    expect(res.exitCode).toBe(ExitCode.UsageError)
  })

  it('lets a deliberate this.exit() pass through untouched', async () => {
    // ExitError is not an error: turning it into an envelope would corrupt the
    // exit code of every streaming command.
    const res = await catchWith(new Errors.ExitError(0), true)

    // What matters is that dcw does NOT claim it: no E_* envelope of ours, and no
    // second exit on top of the one already in flight. How oclif's own fallback
    // handler then serializes the ExitError is its business — 4.5 logged the raw
    // error object, 4.14 logs a structured form — so assert our contract, not theirs.
    expect(res.exitCode).toBeUndefined()
    expect(res.jsonLogs).toHaveLength(1)
    const envelope = (res.jsonLogs[0] as { error: { code?: string } }).error
    expect(envelope.code).not.toMatch(/^E_/)
  })

  it('wraps an untyped failure in the same envelope, never a raw Node error object', async () => {
    const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    const res = await catchWith(err, true)
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_INTERNAL', message: 'ENOENT: no such file (ENOENT)' } }])
    expect(res.exitCode).toBe(ExitCode.GenericError)
  })

  it('omits the parenthetical when the failure carries no errno code', async () => {
    const res = await catchWith(new Error('plain bug'), true)
    expect(res.jsonLogs).toEqual([{ error: { code: 'E_INTERNAL', message: 'plain bug' } }])
  })

  it('leaves non-JSON handling of untyped errors to oclif', async () => {
    const res = await catchWith(new Error('plain bug'), false)
    expect(res.jsonLogs).toEqual([])
    expect(res.thrown).toBeInstanceOf(Error)
  })
})

describe('base flags', () => {
  it('exposes the global AI-native flags on every command', () => {
    expect(Object.keys(BaseCommand.baseFlags)).toEqual(['yes', 'no-input', 'engine', 'strict'])
  })

  it('restricts --engine to the known engines plus auto, and reads DCW_ENGINE', () => {
    const engine = BaseCommand.baseFlags.engine as unknown as { options: string[]; env: string }
    expect(engine.options).toEqual(['auto', 'docker', 'podman', 'orbstack', 'apple-container', 'lima'])
    expect(engine.env).toBe('DCW_ENGINE')
  })

  it('enables the JSON flag by default', () => {
    expect(BaseCommand.enableJsonFlag).toBe(true)
  })
})
