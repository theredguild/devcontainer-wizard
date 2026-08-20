import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'

interface Invocation {
  bin: string
  args: string[]
  opts?: Record<string, unknown>
}

const captured: Invocation[] = []
const inherited: Invocation[] = []
/** Scripted `capture` replies matched against the joined argv, in declaration order. */
let script: Array<{ match: RegExp; result: Partial<CaptureResult> }> = []
let inheritCode = 0

vi.mock('../../src/engine/exec.js', () => ({
  capture: async (bin: string, args: string[], opts?: Record<string, unknown>): Promise<CaptureResult> => {
    captured.push({ bin, args, opts })
    const hit = script.find((s) => s.match.test(`${bin} ${args.join(' ')}`))
    return { code: 0, stdout: '', stderr: '', spawnError: false, ...(hit?.result ?? {}) }
  },
  inherit: async (bin: string, args: string[], opts?: Record<string, unknown>): Promise<number> => {
    inherited.push({ bin, args, opts })
    return inheritCode
  },
}))

const { DockerDriver } = await import('../../src/engine/drivers/docker.js')
const { PodmanDriver } = await import('../../src/engine/drivers/podman.js')
const { LimaDriver } = await import('../../src/engine/drivers/lima.js')
const { OrbstackDriver } = await import('../../src/engine/drivers/orbstack.js')
const { parsePsJson } = await import('../../src/engine/drivers/cli-driver.js')

const argvOf = (i: Invocation) => `${i.bin} ${i.args.join(' ')}`

beforeEach(() => {
  captured.length = 0
  inherited.length = 0
  script = []
  inheritCode = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CliDriver.detect', () => {
  it('reports the first version line and probes daemon readiness', async () => {
    script = [{ match: /docker --version/, result: { stdout: 'Docker version 27.0.3\nextra\n' } }]
    expect(await new DockerDriver().detect()).toEqual({ available: true, version: 'Docker version 27.0.3' })
    expect(captured.map(argvOf)).toContain('docker info')
  })

  it('reports the binary as missing when it cannot be spawned', async () => {
    script = [{ match: /podman --version/, result: { spawnError: true, code: 127 } }]
    expect(await new PodmanDriver().detect()).toEqual({ available: false, reason: 'podman not found on PATH.' })
    // No point probing a daemon whose CLI is absent.
    expect(captured.map(argvOf)).not.toContain('podman info')
  })

  it("surfaces the daemon's own error when the runtime is not ready", async () => {
    script = [{ match: /podman info/, result: { code: 1, stderr: 'cannot connect to Podman socket\n' } }]
    expect(await new PodmanDriver().detect()).toMatchObject({
      available: false,
      reason: 'cannot connect to Podman socket',
    })
  })

  it('falls back to a generic reason when the failing probe said nothing', async () => {
    script = [{ match: /podman info/, result: { code: 1 } }]
    expect(await new PodmanDriver().detect()).toMatchObject({ reason: 'Podman runtime is not ready.' })
  })

  it('uses the separate version binary and subcommand prefix configured by Lima', async () => {
    await new LimaDriver().detect()
    expect(captured.map(argvOf)).toEqual(['limactl --version', 'lima nerdctl info'])
  })
})

describe('DockerDriver AppArmor probing', () => {
  it('trusts the daemon, not the host, and marks AppArmor supported when it reports the LSM', async () => {
    script = [{ match: /SecurityOptions/, result: { stdout: '["name=seccomp","name=apparmor"]' } }]
    const driver = new DockerDriver()
    await driver.detect()
    expect(driver.capabilities.apparmor).toEqual({ support: 'supported' })
  })

  it('marks AppArmor unenforced when the daemon does not report it', async () => {
    script = [{ match: /SecurityOptions/, result: { stdout: '["name=seccomp"]' } }]
    const driver = new DockerDriver()
    await driver.detect()
    expect(driver.capabilities.apparmor).toMatchObject({ support: 'caveated', enforced: false })
    expect(driver.capabilities.apparmor.note).toContain('does not report AppArmor support')
  })

  it('keeps the fail-closed default when the probe itself fails', async () => {
    script = [{ match: /SecurityOptions/, result: { code: 1 } }]
    const driver = new DockerDriver()
    await driver.detect()
    // Claiming enforcement we could not verify is the failure mode that matters.
    expect(driver.capabilities.apparmor).toMatchObject({ support: 'caveated', enforced: false })
    expect(driver.capabilities.apparmor.note).toContain('could not be confirmed')
  })

  it('does not probe capabilities at all when Docker is unavailable', async () => {
    script = [{ match: /docker --version/, result: { spawnError: true } }]
    await new DockerDriver().detect()
    expect(captured.map(argvOf).some((a) => a.includes('SecurityOptions'))).toBe(false)
  })
})

describe('OrbstackDriver.detect', () => {
  it('accepts Docker when the active context is OrbStack', async () => {
    script = [
      { match: /docker --version/, result: { stdout: 'Docker version 27.0.3' } },
      { match: /docker context show/, result: { stdout: 'orbstack\n' } },
    ]
    expect(await new OrbstackDriver().detect()).toEqual({ available: true, version: 'Docker version 27.0.3' })
  })

  it('falls back to matching `docker info` when the context name is uninformative', async () => {
    script = [
      { match: /docker context show/, result: { stdout: 'default\n' } },
      { match: /docker info --format \{\{json \.\}\}/, result: { stdout: '{"Name":"orbstack"}' } },
    ]
    expect(await new OrbstackDriver().detect()).toMatchObject({ available: true })
  })

  it('reports unavailable when Docker is running but is not OrbStack', async () => {
    script = [
      { match: /docker context show/, result: { stdout: 'desktop-linux\n' } },
      { match: /docker info --format \{\{json \.\}\}/, result: { stdout: '{"Name":"docker-desktop"}' } },
    ]
    expect(await new OrbstackDriver().detect()).toMatchObject({
      available: false,
      reason: 'Docker is running but the active context is not OrbStack.',
    })
  })

  it('short-circuits when Docker itself is unavailable', async () => {
    script = [{ match: /docker --version/, result: { spawnError: true } }]
    expect(await new OrbstackDriver().detect()).toMatchObject({ available: false })
    expect(captured.map(argvOf).some((a) => a.includes('context show'))).toBe(false)
  })

  it('keeps the fail-closed AppArmor default when the daemon probe fails', async () => {
    script = [
      { match: /SecurityOptions/, result: { code: 1 } },
      { match: /docker context show/, result: { stdout: 'orbstack' } },
    ]
    const driver = new OrbstackDriver()
    await driver.detect()
    expect(driver.capabilities.apparmor).toMatchObject({ support: 'caveated', enforced: false })
  })

  it('probes the daemon for AppArmor like the Docker driver does', async () => {
    script = [
      { match: /SecurityOptions/, result: { stdout: '["name=apparmor"]' } },
      { match: /docker context show/, result: { stdout: 'orbstack' } },
    ]
    const driver = new OrbstackDriver()
    await driver.detect()
    expect(driver.capabilities.apparmor).toEqual({ support: 'supported' })
  })
})

describe('CliDriver.build', () => {
  it('composes the build argv and reads the image id back via inspect', async () => {
    script = [{ match: /image inspect/, result: { stdout: 'sha256:abc\n' } }]
    const res = await new DockerDriver().build({
      containerfilePath: '/state/Containerfile',
      contextDir: '/state',
      tag: 'dcw/env1:latest',
      platform: 'linux/amd64',
      noCache: true,
      buildArgs: { FOO: 'bar' },
    })

    expect(res).toEqual({ imageId: 'sha256:abc' })
    expect(argvOf(inherited[0]!)).toBe(
      'docker build -f /state/Containerfile -t dcw/env1:latest --platform linux/amd64 --no-cache --build-arg FOO=bar /state',
    )
  })

  it('omits the optional flags when they are not requested', async () => {
    await new DockerDriver().build({ containerfilePath: '/c', contextDir: '/ctx', tag: 't' })
    expect(argvOf(inherited[0]!)).toBe('docker build -f /c -t t /ctx')
  })

  it('falls back to the tag when the image id cannot be inspected', async () => {
    script = [{ match: /image inspect/, result: { code: 1 } }]
    expect(await new DockerDriver().build({ containerfilePath: '/c', contextDir: '/ctx', tag: 'dcw/x:latest' })).toEqual({
      imageId: 'dcw/x:latest',
    })
  })

  it('raises with the exit code when the build fails', async () => {
    inheritCode = 2
    await expect(
      new DockerDriver().build({ containerfilePath: '/c', contextDir: '/ctx', tag: 't' }),
    ).rejects.toThrow('Docker build failed (exit 2).')
  })
})

describe('CliDriver.run', () => {
  it('composes name, labels, hardening flags, workdir, env and command in order', async () => {
    script = [{ match: /docker run/, result: { stdout: 'cid-123\n' } }]
    const res = await new DockerDriver().run({
      image: 'dcw/env1:latest',
      name: 'dcw-env1',
      labels: { 'dcw.env': 'env1' },
      flags: ['--cap-drop=ALL', '-v', '/ws:/workspace'],
      workdir: '/workspace',
      env: { FOO: 'bar' },
      detach: true,
      command: ['sleep', 'infinity'],
    })

    expect(res).toEqual({ containerId: 'cid-123' })
    expect(argvOf(captured.at(-1)!)).toBe(
      'docker run -d --name dcw-env1 --label dcw.env=env1 --cap-drop=ALL -v /ws:/workspace -w /workspace -e FOO=bar dcw/env1:latest sleep infinity',
    )
  })

  it('omits -d, -w and the command when they are not requested', async () => {
    await new DockerDriver().run({ image: 'img', name: 'n', flags: [], detach: false })
    expect(argvOf(captured.at(-1)!)).toBe('docker run --name n img')
  })

  it('takes the LAST stdout line as the container id, past any daemon chatter', async () => {
    script = [{ match: /docker run/, result: { stdout: 'Unable to find image locally\ncid-999\n' } }]
    expect(await new DockerDriver().run({ image: 'i', name: 'n', flags: [], detach: true })).toEqual({
      containerId: 'cid-999',
    })
  })

  it('raises with the engine stderr when the run fails', async () => {
    script = [{ match: /docker run/, result: { code: 125, stderr: 'port is already allocated\n' } }]
    await expect(new DockerDriver().run({ image: 'i', name: 'n', flags: [], detach: true })).rejects.toThrow(
      'Docker run failed: port is already allocated',
    )
  })

  it('still names the failing action when the engine said nothing', async () => {
    script = [{ match: /docker run/, result: { code: 1 } }]
    await expect(new DockerDriver().run({ image: 'i', name: 'n', flags: [], detach: true })).rejects.toThrow(
      'Docker run failed.',
    )
  })
})

describe('CliDriver.exec', () => {
  const spec = { container: 'cid-1', cmd: ['ls', '-la'], interactive: true, tty: true }

  it('passes -i/-t and the user, then the container and command', async () => {
    await new DockerDriver().exec({ ...spec, user: 'vscode' })
    expect(argvOf(inherited[0]!)).toBe('docker exec -i -t --user vscode cid-1 ls -la')
  })

  it('omits -i/-t when there is no terminal', async () => {
    await new DockerDriver().exec({ ...spec, interactive: false, tty: false })
    expect(argvOf(inherited[0]!)).toBe('docker exec cid-1 ls -la')
  })

  it('passes -e NAME value-less so secrets never enter argv or the host process table', async () => {
    await new DockerDriver().exec({ ...spec, env: { GITHUB_TOKEN: 'ghp_secret' } })
    const call = inherited[0]!
    expect(call.args.join(' ')).toContain('-e GITHUB_TOKEN')
    expect(call.args.join(' ')).not.toContain('ghp_secret')
    // The value reaches the engine by inheritance through our own environment.
    expect((call.opts?.env as NodeJS.ProcessEnv).GITHUB_TOKEN).toBe('ghp_secret')
  })

  it('leaves the process environment untouched when there are no env forwards', async () => {
    await new DockerDriver().exec(spec)
    expect(inherited[0]!.opts?.env).toBeUndefined()
    await new DockerDriver().exec({ ...spec, env: {} })
    expect(inherited[1]!.opts?.env).toBeUndefined()
  })

  it('returns the exit code of the exec\'d process', async () => {
    inheritCode = 42
    expect(await new DockerDriver().exec(spec)).toBe(42)
  })
})

describe('CliDriver.execCapture', () => {
  it('feeds stdin when input is supplied', async () => {
    await new DockerDriver().execCapture({ container: 'c', cmd: ['sh'], interactive: true, tty: false }, 'key-data')
    expect(captured[0]!.opts).toEqual({ input: 'key-data' })
  })

  it('passes neither input nor env when neither is supplied', async () => {
    await new DockerDriver().execCapture({ container: 'c', cmd: ['sh'], interactive: false, tty: false })
    expect(captured[0]!.opts).toEqual({})
  })

  it('merges forwarded env vars into the captured process environment', async () => {
    await new DockerDriver().execCapture({
      container: 'c',
      cmd: ['env'],
      interactive: false,
      tty: false,
      env: { A: '1' },
    })
    expect((captured[0]!.opts?.env as NodeJS.ProcessEnv).A).toBe('1')
  })
})

describe('CliDriver.stop / rm', () => {
  it('stops by id', async () => {
    await new DockerDriver().stop('cid-1')
    expect(argvOf(captured[0]!)).toBe('docker stop cid-1')
  })

  it('raises with the engine stderr when the stop fails', async () => {
    script = [{ match: /docker stop/, result: { code: 1, stderr: 'no such container\n' } }]
    await expect(new DockerDriver().stop('cid-1')).rejects.toThrow('Docker stop failed: no such container')
  })

  it('removes, with and without --force', async () => {
    const driver = new DockerDriver()
    await driver.rm('cid-1')
    await driver.rm('cid-1', { force: true })
    expect(captured.map(argvOf)).toEqual(['docker rm cid-1', 'docker rm -f cid-1'])
  })

  it('raises when the removal fails', async () => {
    script = [{ match: /docker rm/, result: { code: 1, stderr: 'container is running\n' } }]
    await expect(new DockerDriver().rm('cid-1')).rejects.toThrow('Docker rm failed: container is running')
  })

  it('uses the engine\'s own verb where it differs (Lima keeps docker verbs behind nerdctl)', async () => {
    await new LimaDriver().rm('cid-1', { force: true })
    expect(argvOf(captured[0]!)).toBe('lima nerdctl rm -f cid-1')
  })
})

describe('CliDriver.ps', () => {
  const row = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ ID: 'c1', Names: 'dcw-env1', Image: 'img', Status: 'Up 2m', Labels: 'dcw.env=env1,x=y', ...over })

  it('requests NDJSON, includes stopped containers by default, and parses the rows', async () => {
    script = [{ match: /docker ps/, result: { stdout: `${row()}\n` } }]
    const res = await new DockerDriver().ps()
    expect(argvOf(captured[0]!)).toBe('docker ps -a --format {{json .}}')
    expect(res).toEqual([
      { id: 'c1', name: 'dcw-env1', image: 'img', status: 'Up 2m', labels: { 'dcw.env': 'env1', x: 'y' } },
    ])
  })

  it('passes a label filter through to the engine and can exclude stopped containers', async () => {
    await new DockerDriver().ps({ label: 'dcw.env=env1', all: false })
    expect(argvOf(captured[0]!)).toBe('docker ps --filter label=dcw.env=env1 --format {{json .}}')
  })

  it('returns an empty list rather than throwing when the engine is unreachable', async () => {
    script = [{ match: /docker ps/, result: { code: 1, stderr: 'daemon down' } }]
    expect(await new DockerDriver().ps()).toEqual([])
  })
})

describe('parsePsJson', () => {
  it('accepts both docker and nerdctl field spellings', async () => {
    const rows = parsePsJson(
      [
        JSON.stringify({ ID: 'a', Names: 'na', Image: 'ia', Status: 'Up', Labels: '' }),
        JSON.stringify({ Id: 'b', Name: 'nb', Image: 'ib', State: 'running', Labels: { k: 1 } }),
      ].join('\n'),
    )
    expect(rows).toEqual([
      { id: 'a', name: 'na', image: 'ia', status: 'Up', labels: {} },
      { id: 'b', name: 'nb', image: 'ib', status: 'running', labels: { k: '1' } },
    ])
  })

  it('skips blank and malformed lines instead of failing the whole listing', async () => {
    expect(parsePsJson('\n  \nnot json\n{"ID":"a"}\n')).toEqual([
      { id: 'a', name: '', image: '', status: '', labels: {} },
    ])
  })

  it('ignores label fragments with no key', async () => {
    const [row0] = parsePsJson(JSON.stringify({ ID: 'a', Labels: '=novalue,ok=1,bare' }))
    expect(row0?.labels).toEqual({ ok: '1' })
  })
})

describe('CliDriver.runOnce', () => {
  it('runs a throwaway container with the extra flags before the image', async () => {
    script = [{ match: /docker run --rm/, result: { stdout: 'report\n', code: 0 } }]
    const res = await new DockerDriver().runOnce('dcw/env1:latest', ['cat', '/report'], ['--network=none'])
    expect(argvOf(captured[0]!)).toBe('docker run --rm --network=none dcw/env1:latest cat /report')
    expect(res).toEqual({ stdout: 'report\n', code: 0 })
  })

  it('defaults to no extra flags', async () => {
    await new DockerDriver().runOnce('img', ['true'])
    expect(argvOf(captured[0]!)).toBe('docker run --rm img true')
  })
})

describe('CliDriver.logs', () => {
  it('streams logs, forwarding --follow and --tail', async () => {
    await new DockerDriver().logs('cid-1', { follow: true, tail: 100 })
    expect(argvOf(inherited[0]!)).toBe('docker logs -f --tail 100 cid-1')
  })

  it('omits both when neither is requested', async () => {
    await new DockerDriver().logs('cid-1')
    expect(argvOf(inherited[0]!)).toBe('docker logs cid-1')
  })

  it('forwards --tail 0', async () => {
    await new DockerDriver().logs('cid-1', { tail: 0 })
    expect(argvOf(inherited[0]!)).toBe('docker logs --tail 0 cid-1')
  })

  it('returns the exit code of the stream', async () => {
    inheritCode = 1
    expect(await new DockerDriver().logs('cid-1')).toBe(1)
  })
})
