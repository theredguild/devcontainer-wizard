import { describe, expect, it } from 'vitest'
import { capture, inherit } from '../../src/engine/exec.js'

const NODE = process.execPath

describe('capture', () => {
  it('collects stdout and the exit code', async () => {
    const res = await capture(NODE, ['-e', 'process.stdout.write("hello")'])
    expect(res).toEqual({ code: 0, stdout: 'hello', stderr: '', spawnError: false })
  })

  it('collects stderr and a non-zero exit code without throwing', async () => {
    const res = await capture(NODE, ['-e', 'process.stderr.write("boom"); process.exit(3)'])
    expect(res).toMatchObject({ code: 3, stderr: 'boom', spawnError: false })
  })

  it('reports spawnError with code 127 when the binary does not exist', async () => {
    const res = await capture('definitely-not-a-real-binary-xyz', [])
    expect(res.spawnError).toBe(true)
    expect(res.code).toBe(127)
    // The spawn error message stands in for stderr, so callers have something to show.
    expect(res.stderr).not.toBe('')
  })

  it('feeds stdin when input is supplied', async () => {
    const res = await capture(NODE, ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'piped-in' })
    expect(res.stdout).toBe('piped-in')
  })

  it('passes a custom environment and working directory', async () => {
    const res = await capture(NODE, ['-e', 'process.stdout.write(process.env.DCW_T + "|" + process.cwd())'], {
      env: { ...process.env, DCW_T: 'x' },
      cwd: '/tmp',
    })
    const [value, cwd] = res.stdout.split('|')
    expect(value).toBe('x')
    // macOS resolves /tmp through a symlink, so compare on the suffix.
    expect(cwd?.endsWith('/tmp')).toBe(true)
  })

  it('treats a signalled child (null exit code) as exit 0 rather than crashing', async () => {
    const res = await capture(NODE, ['-e', 'process.kill(process.pid, "SIGKILL")'])
    expect(typeof res.code).toBe('number')
    expect(res.spawnError).toBe(false)
  })
})

describe('inherit', () => {
  it('resolves with the child exit code', async () => {
    expect(await inherit(NODE, ['-e', 'process.exit(0)'])).toBe(0)
    expect(await inherit(NODE, ['-e', 'process.exit(5)'])).toBe(5)
  })

  it('resolves with 127 when the binary cannot be spawned', async () => {
    expect(await inherit('definitely-not-a-real-binary-xyz', [])).toBe(127)
  })

  it('passes a custom environment and working directory', async () => {
    expect(
      await inherit(NODE, ['-e', 'process.exit(process.env.DCW_T === "9" && process.cwd().endsWith("/tmp") ? 0 : 1)'], {
        env: { ...process.env, DCW_T: '9' },
        cwd: '/tmp',
      }),
    ).toBe(0)
  })
})
