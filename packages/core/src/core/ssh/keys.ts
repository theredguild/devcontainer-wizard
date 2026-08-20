import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { DcwError } from '../../errors.js'
import { capture } from '../../engine/exec.js'
import { sshDir } from '../../state/paths.js'

export interface DcwKeypair {
  /** Absolute path to the private key (the editor's IdentityFile). */
  privateKeyPath: string
  /** Absolute path to the public key. */
  publicKeyPath: string
  /** Public key contents (single line, no trailing newline). */
  publicKey: string
}

/** Absolute path to the file pinning container host keys for attach. */
export function knownHostsPath(): string {
  return path.join(sshDir(), 'known_hosts')
}

/**
 * Absolute path to the persisted container host private key for `alias`. Stored
 * host-side so the container's SSH identity survives recreates and a tmpfs-backed
 * ~/.ssh — keeping the known_hosts pin durable instead of a fresh TOFU each time.
 */
export function hostKeyPath(alias: string): string {
  return path.join(sshDir(), 'hostkeys', alias)
}

/**
 * Ensure dcw's own ed25519 keypair exists under ~/.config/dcw/ssh and return it.
 * dcw never touches the user's personal keys — it manages a dedicated pair used
 * only for container attach. Generated once with `ssh-keygen`; idempotent.
 */
export async function ensureKeypair(): Promise<DcwKeypair> {
  const dir = sshDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const privateKeyPath = path.join(dir, 'id_ed25519')
  const publicKeyPath = `${privateKeyPath}.pub`

  if (!(await exists(publicKeyPath)) || !(await exists(privateKeyPath))) {
    const res = await capture('ssh-keygen', [
      '-q',
      '-t',
      'ed25519',
      '-N',
      '',
      '-C',
      'dcw-attach',
      '-f',
      privateKeyPath,
    ])
    if (res.spawnError) {
      throw new DcwError('ssh-keygen not found on PATH; install OpenSSH to use `dcw attach`.')
    }
    if (res.code !== 0) {
      throw new DcwError(`Failed to generate dcw SSH key: ${res.stderr.trim() || `exit ${res.code}`}.`)
    }
  }

  const publicKey = (await fs.readFile(publicKeyPath, 'utf8')).trim()
  return { privateKeyPath, publicKeyPath, publicKey }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
