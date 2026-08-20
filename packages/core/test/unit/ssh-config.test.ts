import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hostAlias,
  removeSshConfig,
  renderEntry,
  writeSshConfig,
  type SshConfigEntry,
} from '../../src/core/ssh/ssh-config.js'

let tmp: string
let realHome: string | undefined

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-ssh-'))
  realHome = process.env.HOME
  process.env.HOME = tmp
})

afterEach(async () => {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
  await fs.rm(tmp, { recursive: true, force: true })
})

function execEntry(name: string): SshConfigEntry {
  return {
    name,
    mode: 'exec',
    identityFile: '/keys/id_ed25519',
    knownHostsFile: '/keys/known_hosts',
    proxyCommand: `dcw ssh-proxy ${name}`,
  }
}

async function readConfig(): Promise<string> {
  return fs.readFile(path.join(tmp, '.ssh', 'config'), 'utf8')
}

describe('ssh-config', () => {
  it('renders an exec entry with a ProxyCommand and no port', () => {
    const body = renderEntry(execEntry('alpha'))
    expect(body).toContain('Host dcw-alpha')
    expect(body).toContain('ProxyCommand dcw ssh-proxy alpha')
    expect(body).toContain('User vscode')
    expect(body).not.toContain('HostName')
    expect(body).not.toContain('Port')
  })

  it('renders a port entry with HostName/Port and no ProxyCommand', () => {
    const body = renderEntry({
      name: 'beta',
      mode: 'port',
      identityFile: '/k/id',
      knownHostsFile: '/k/kh',
      port: 2222,
    })
    expect(body).toContain('HostName localhost')
    expect(body).toContain('Port 2222')
    expect(body).not.toContain('ProxyCommand')
  })

  it('is idempotent: writing the same entry twice yields one managed block', async () => {
    const alias = await writeSshConfig(execEntry('alpha'))
    expect(alias).toBe('dcw-alpha')
    await writeSshConfig(execEntry('alpha'))
    const content = await readConfig()
    const begins = content.match(/# >>> dcw alpha >>>/g) ?? []
    expect(begins).toHaveLength(1)
  })

  it('preserves unrelated host blocks and other dcw envs', async () => {
    const file = path.join(tmp, '.ssh', 'config')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'Host github.com\n  User git\n')

    await writeSshConfig(execEntry('alpha'))
    await writeSshConfig(execEntry('beta'))
    let content = await readConfig()
    expect(content).toContain('Host github.com')
    expect(content).toContain('Host dcw-alpha')
    expect(content).toContain('Host dcw-beta')

    await removeSshConfig('alpha')
    content = await readConfig()
    expect(content).toContain('Host github.com')
    expect(content).not.toContain('Host dcw-alpha')
    expect(content).toContain('Host dcw-beta')
  })

  it('hostAlias is dcw-prefixed', () => {
    expect(hostAlias('my-env')).toBe('dcw-my-env')
  })
})
