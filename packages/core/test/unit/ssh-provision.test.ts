import * as fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SSHD_CONFIG_PATH } from '../../src/containerfile/base.js'
import { hostKeyPath, knownHostsPath } from '../../src/core/ssh/keys.js'
import { provisionContainerSsh, startSshDaemon } from '../../src/core/ssh/provision.js'
import type { CaptureResult } from '../../src/engine/exec.js'
import type { EngineDriver, ExecSpec } from '../../src/engine/types.js'
import { useTempState } from '../helpers/fixtures.js'

interface Call {
  spec: ExecSpec
  input?: string
}

/** Driver whose execCapture replies are scripted by matching on the command text. */
function scriptedDriver(script: Array<{ match: RegExp; result: Partial<CaptureResult> }>) {
  const calls: Call[] = []
  const driver = {
    execCapture: vi.fn(async (spec: ExecSpec, input?: string): Promise<CaptureResult> => {
      calls.push({ spec, input })
      const joined = spec.cmd.join(' ')
      const hit = script.find((s) => s.match.test(joined))
      return { code: 0, stdout: '', stderr: '', spawnError: false, ...(hit?.result ?? {}) }
    }),
  } as unknown as EngineDriver
  return { driver, calls }
}

const PUBKEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexample dcw-attach'
const HOST_PUB = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIhostkey root@container'
const HOST_PRIV = '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n'

let state: Awaited<ReturnType<typeof useTempState>>

beforeEach(async () => {
  state = await useTempState('dcw-provision-')
})

afterEach(async () => {
  await state.cleanup()
  vi.restoreAllMocks()
})

describe('provisionContainerSsh', () => {
  it('feeds the public key over stdin rather than interpolating it into a shell command', async () => {
    const { driver, calls } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])

    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })

    const install = calls.find((c) => c.spec.cmd.join(' ').includes('authorized_keys'))!
    expect(install.input).toBe(`${PUBKEY}\n`)
    expect(install.spec.cmd.join(' ')).not.toContain(PUBKEY)
    // The append is guarded by grep, so re-provisioning cannot duplicate the key.
    expect(install.spec.cmd.join(' ')).toContain('grep -qxF "$key"')
    expect(install.spec.user).toBe('vscode')
  })

  it('persists the container host key host-side so the known_hosts pin survives recreates', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])

    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })

    expect(await fs.readFile(hostKeyPath('dcw-env1'), 'utf8')).toBe(HOST_PRIV)
    const stat = await fs.stat(hostKeyPath('dcw-env1'))
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('re-injects an already-persisted host key instead of generating a new one', async () => {
    await fs.mkdir(state.dir, { recursive: true })
    const stored = hostKeyPath('dcw-env1')
    await fs.mkdir(stored.slice(0, stored.lastIndexOf('/')), { recursive: true })
    await fs.writeFile(stored, HOST_PRIV)

    const { driver, calls } = scriptedDriver([{ match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } }])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })

    const inject = calls[0]!
    expect(inject.input).toBe(HOST_PRIV)
    expect(inject.spec.cmd.join(' ')).toContain('ssh-keygen -y -f')
  })

  it('pins the host key in known_hosts in <alias> <type> <key> form', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })

    const [type, key] = HOST_PUB.split(' ')
    expect(await fs.readFile(knownHostsPath(), 'utf8')).toBe(`dcw-env1 ${type} ${key}\n`)
  })

  it('replaces a stale pin for the same alias while keeping other hosts', async () => {
    const file = knownHostsPath()
    await fs.mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true })
    await fs.writeFile(file, 'other-host ssh-ed25519 KEEPME\ndcw-env1 ssh-ed25519 STALE\n')

    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })

    const content = await fs.readFile(file, 'utf8')
    expect(content).toContain('other-host ssh-ed25519 KEEPME')
    expect(content).not.toContain('STALE')
    expect(content.trim().split('\n')).toHaveLength(2)
  })

  it('raises a rebuild hint when the key install fails', async () => {
    const { driver } = scriptedDriver([{ match: /authorized_keys/, result: { code: 1, stderr: 'sshd missing\n' } }])
    await expect(
      provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' }),
    ).rejects.toThrow(/sshd missing.*dcw build/s)
  })

  it('reports the exit code when the failing install produced no stderr', async () => {
    const { driver } = scriptedDriver([{ match: /authorized_keys/, result: { code: 3 } }])
    await expect(
      provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' }),
    ).rejects.toThrow(/exit 3/)
  })

  it('is best-effort about persisting the host key: a failed capture is not fatal', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { code: 1 } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])
    await expect(
      provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' }),
    ).resolves.toBeUndefined()
    await expect(fs.access(hostKeyPath('dcw-env1'))).rejects.toThrow()
  })

  it('skips persisting when the container returned an empty host key', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: '  \n' } },
      { match: /^cat \/home\/vscode/, result: { stdout: `${HOST_PUB}\n` } },
    ])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })
    await expect(fs.access(hostKeyPath('dcw-env1'))).rejects.toThrow()
  })

  it('leaves known_hosts alone when the host pubkey cannot be read', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { code: 1 } },
    ])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })
    // ssh's accept-new will pin on first use instead.
    await expect(fs.access(knownHostsPath())).rejects.toThrow()
  })

  it('ignores a malformed host pubkey rather than writing a broken pin', async () => {
    const { driver } = scriptedDriver([
      { match: /cat "\/home\/vscode\/\.ssh\/ssh_host_ed25519_key"$/, result: { stdout: HOST_PRIV } },
      { match: /^cat \/home\/vscode/, result: { stdout: 'garbage\n' } },
    ])
    await provisionContainerSsh({ driver, container: 'cid-1', publicKey: PUBKEY, hostAlias: 'dcw-env1' })
    await expect(fs.access(knownHostsPath())).rejects.toThrow()
  })
})

describe('startSshDaemon', () => {
  it('kills a prior daemon by pidfile — never by a -f pattern that would match itself', async () => {
    const { driver, calls } = scriptedDriver([])
    await startSshDaemon(driver, 'cid-1')

    const cmd = calls[0]!.spec.cmd.join(' ')
    expect(cmd).toContain('/home/vscode/.ssh/sshd.pid')
    expect(cmd).not.toContain('pkill -f')
    expect(cmd).toContain(`setsid /usr/sbin/sshd -D -f ${SSHD_CONFIG_PATH} -p 2222`)
    expect(calls[0]!.spec.user).toBe('vscode')
  })

  it('raises when the daemon fails to start', async () => {
    const { driver } = scriptedDriver([{ match: /sshd/, result: { code: 1, stderr: 'no sshd\n' } }])
    await expect(startSshDaemon(driver, 'cid-1')).rejects.toThrow(/Failed to start SSH daemon in 'cid-1': no sshd/)
  })

  it('reports the exit code when the failure produced no stderr', async () => {
    const { driver } = scriptedDriver([{ match: /sshd/, result: { code: 9 } }])
    await expect(startSshDaemon(driver, 'cid-1')).rejects.toThrow(/exit 9/)
  })
})
