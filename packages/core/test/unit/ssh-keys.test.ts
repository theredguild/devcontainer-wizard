import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureKeypair, knownHostsPath } from '../../src/core/ssh/keys.js'

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-keys-'))
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
})

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('ssh keys', () => {
  it('generates an ed25519 keypair once and reuses it', async () => {
    const first = await ensureKeypair()
    expect(first.publicKey).toMatch(/^ssh-ed25519 /)
    await fs.access(first.privateKeyPath)
    await fs.access(first.publicKeyPath)

    const second = await ensureKeypair()
    expect(second.publicKey).toBe(first.publicKey)
  })

  it('places known_hosts alongside the keypair under the dcw config dir', () => {
    expect(knownHostsPath()).toBe(path.join(tmp, 'config', 'dcw', 'ssh', 'known_hosts'))
  })
})
