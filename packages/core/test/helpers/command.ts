import type { Command } from '@oclif/core'

/** Thrown by the stubbed `this.exit()` so tests can observe the exit code. */
export class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`)
    this.name = 'ExitSignal'
  }
}

export interface HarnessOptions {
  args?: Record<string, unknown>
  flags?: Record<string, unknown>
  argv?: string[]
  /** What `this.jsonEnabled()` reports. */
  json?: boolean
  /** Version reported through `this.config.version`. */
  version?: string
}

export interface Harness {
  cmd: Record<string, any>
  logs: string[]
  warns: string[]
  jsonLogs: unknown[]
}

/**
 * Build a runnable oclif command without booting an oclif Config.
 *
 * Commands are plain classes whose `run()` only reaches the framework through
 * `parse`/`log`/`warn`/`error`/`exit`/`jsonEnabled`/`config`, so stubbing those on
 * an object created from the prototype exercises the real command body in-process
 * (which a subprocess CLI test cannot do — its coverage is invisible).
 */
export function harness(Cmd: unknown, opts: HarnessOptions = {}): Harness {
  const cmd: Record<string, any> = Object.create((Cmd as typeof Command).prototype)
  const logs: string[] = []
  const warns: string[] = []
  const jsonLogs: unknown[] = []

  cmd.parse = async () => ({ args: opts.args ?? {}, flags: opts.flags ?? {}, argv: opts.argv ?? [] })
  cmd.jsonEnabled = () => opts.json ?? false
  cmd.log = (message = '') => {
    logs.push(String(message))
  }
  cmd.logJson = (value: unknown) => {
    jsonLogs.push(value)
  }
  cmd.warn = (message: string | Error) => {
    warns.push(typeof message === 'string' ? message : message.message)
    return message
  }
  cmd.error = (message: string | Error, options: Record<string, unknown> = {}) => {
    const err = typeof message === 'string' ? new Error(message) : message
    throw Object.assign(err, options)
  }
  cmd.exit = (code = 0) => {
    throw new ExitSignal(code)
  }
  cmd.config = { version: opts.version ?? '2.0.0', bin: 'dcw' }

  return { cmd, logs, warns, jsonLogs }
}

export interface RunResult<T> {
  result: T | undefined
  logs: string[]
  warns: string[]
  jsonLogs: unknown[]
  /** Set when the command called `this.exit()`; undefined when it returned normally. */
  exitCode: number | undefined
}

/** Run a command in-process, capturing its output and exit code. */
export async function runCommand<T = unknown>(Cmd: unknown, opts: HarnessOptions = {}): Promise<RunResult<T>> {
  const h = harness(Cmd, opts)
  try {
    const result = (await h.cmd.run()) as T
    return { result, logs: h.logs, warns: h.warns, jsonLogs: h.jsonLogs, exitCode: undefined }
  } catch (err) {
    if (err instanceof ExitSignal) {
      return { result: undefined, logs: h.logs, warns: h.warns, jsonLogs: h.jsonLogs, exitCode: err.code }
    }
    throw err
  }
}
