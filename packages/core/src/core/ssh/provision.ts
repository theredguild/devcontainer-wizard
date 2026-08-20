import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { DcwError } from '../../errors.js'
import type { EngineDriver } from '../../engine/types.js'
import { SSHD_CONFIG_PATH } from '../../containerfile/base.js'
import { SSH_CONTAINER_PORT } from '../up-pipeline.js'
import { hostKeyPath, knownHostsPath } from './keys.js'

const CONTAINER_USER = 'vscode'
const HOST_KEY = '/home/vscode/.ssh/ssh_host_ed25519_key'
const HOST_KEY_PUB = `${HOST_KEY}.pub`

/**
 * Provision a running container for editor attach: install dcw's public key into
 * the vscode user's authorized_keys (idempotent) and pin the container's host key
 * under the given alias in dcw's known_hosts. The key travels via stdin so it is
 * never interpolated into a shell command.
 */
export async function provisionContainerSsh(opts: {
  driver: EngineDriver
  container: string
  publicKey: string
  hostAlias: string
}): Promise<void> {
  const { driver, container, publicKey, hostAlias } = opts

  // Seed a durable host key first so the known_hosts pin survives recreates and a
  // tmpfs-backed ~/.ssh (otherwise every attach is a fresh trust-on-first-use).
  await ensureDurableHostKey(driver, container, hostAlias)

  // Ensure ~/.ssh + a host key exist (a readonly-os tmpfs over ~/.ssh starts empty),
  // then append the key only if absent. `key=$(cat)` reads it from stdin → no injection.
  const install = [
    'sh',
    '-c',
    'set -e; ' +
      'mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"; ' +
      `[ -f "${HOST_KEY}" ] || ssh-keygen -q -t ed25519 -N "" -f "${HOST_KEY}"; ` +
      'touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"; ' +
      'key=$(cat); ' +
      'grep -qxF "$key" "$HOME/.ssh/authorized_keys" || printf "%s\\n" "$key" >> "$HOME/.ssh/authorized_keys"',
  ]
  const res = await driver.execCapture(
    { container, cmd: install, interactive: true, tty: false, user: CONTAINER_USER },
    `${publicKey}\n`,
  )
  if (res.code !== 0) {
    throw new DcwError(
      `Failed to install attach key into '${container}': ${res.stderr.trim() || `exit ${res.code}`}. ` +
        'Was the image built with SSH support? Rebuild with `dcw build` (SSH is on unless created with --no-ssh).',
    )
  }

  await pinHostKey(driver, container, hostAlias)
}

/**
 * Start a background sshd inside the container for published-port (`--port`) mode.
 * Runs as vscode on the container's SSH port; idempotent (kills a prior dcw daemon
 * first). `setsid` + detached stdio lets it outlive the exec that launched it.
 */
export async function startSshDaemon(driver: EngineDriver, container: string): Promise<void> {
  // Stop a prior daemon via its pidfile, not `pkill -f` — a -f pattern matching the
  // sshd invocation would also match this very `sh -c` (self-kill → exit 143).
  const cmd = [
    'sh',
    '-c',
    'pid=/home/vscode/.ssh/sshd.pid; [ -f "$pid" ] && kill "$(cat "$pid")" 2>/dev/null || true; ' +
      `setsid /usr/sbin/sshd -D -f ${SSHD_CONFIG_PATH} -p ${SSH_CONTAINER_PORT} ` +
      '</dev/null >/dev/null 2>&1 & echo started',
  ]
  const res = await driver.execCapture({ container, cmd, interactive: false, tty: false, user: CONTAINER_USER })
  if (res.code !== 0) {
    throw new DcwError(`Failed to start SSH daemon in '${container}': ${res.stderr.trim() || `exit ${res.code}`}.`)
  }
}

/**
 * Give the container a stable SSH host identity. If we already persisted a host
 * key for this alias, push it back in; otherwise let the container generate one,
 * read it back, and persist it host-side (0600) for next time. Best-effort — on
 * failure we fall back to the install shell's own keygen + accept-new pinning.
 */
async function ensureDurableHostKey(driver: EngineDriver, container: string, alias: string): Promise<void> {
  const stored = hostKeyPath(alias)
  let material: string | null = null
  try {
    material = await fs.readFile(stored, 'utf8')
  } catch {
    // no persisted key yet
  }

  if (material) {
    // Re-inject the persisted private key; derive the matching public key from it.
    const cmd = [
      'sh',
      '-c',
      'set -e; mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"; ' +
        `cat > "${HOST_KEY}"; chmod 600 "${HOST_KEY}"; ssh-keygen -y -f "${HOST_KEY}" > "${HOST_KEY_PUB}"`,
    ]
    await driver.execCapture({ container, cmd, interactive: true, tty: false, user: CONTAINER_USER }, material)
    return
  }

  // First run: ensure a key exists in the container, then capture it to persist.
  const cmd = [
    'sh',
    '-c',
    'set -e; mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"; ' +
      `[ -f "${HOST_KEY}" ] || ssh-keygen -q -t ed25519 -N "" -f "${HOST_KEY}"; cat "${HOST_KEY}"`,
  ]
  const res = await driver.execCapture({ container, cmd, interactive: false, tty: false, user: CONTAINER_USER })
  if (res.code !== 0 || !res.stdout.trim()) return // best-effort

  await fs.mkdir(path.dirname(stored), { recursive: true, mode: 0o700 })
  await fs.writeFile(stored, res.stdout, { mode: 0o600 })
}

/** Read the container's SSH host public key and pin it in dcw's known_hosts for `alias`. */
async function pinHostKey(driver: EngineDriver, container: string, alias: string): Promise<void> {
  const res = await driver.execCapture({
    container,
    cmd: ['cat', HOST_KEY_PUB],
    interactive: false,
    tty: false,
    user: CONTAINER_USER,
  })
  if (res.code !== 0) return // best-effort; accept-new in ssh config will pin on first use

  // A host pubkey file is "<type> <base64> [comment]"; known_hosts wants "<host> <type> <base64>".
  const parts = res.stdout.trim().split(/\s+/)
  if (parts.length < 2) return
  const line = `${alias} ${parts[0]} ${parts[1]}\n`

  const file = knownHostsPath()
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  let existing = ''
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch {
    // no known_hosts yet
  }
  const kept = existing
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith(`${alias} `))
    .join('\n')
  const next = (kept ? `${kept}\n` : '') + line
  await fs.writeFile(file, next, { mode: 0o600 })
}
