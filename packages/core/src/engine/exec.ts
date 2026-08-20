import { spawn } from 'node:child_process'

export interface CaptureResult {
  /** Process exit code, or 127 if the binary could not be spawned (ENOENT). */
  code: number
  stdout: string
  stderr: string
  /** True when the binary itself could not be found / spawned. */
  spawnError: boolean
}

export interface CaptureOptions {
  input?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
}

/** Run a command, capturing stdout/stderr. Never throws on non-zero exit. */
export function capture(bin: string, args: string[], opts: CaptureOptions = {}): Promise<CaptureResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: opts.env ?? process.env,
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })

    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ code: 127, stdout, stderr: stderr || err.message, spawnError: true })
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr, spawnError: false })
    })

    if (opts.input !== undefined) {
      child.stdin.end(opts.input)
    }
  })
}

/** Run a command with inherited stdio (interactive). Resolves with the exit code. */
export function inherit(bin: string, args: string[], opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: opts.env ?? process.env,
      cwd: opts.cwd,
      stdio: 'inherit',
    })
    child.on('error', () => resolve(127))
    child.on('close', (code) => resolve(code ?? 0))
  })
}
