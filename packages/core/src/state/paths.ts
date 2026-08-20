import os from 'node:os'
import path from 'node:path'

const APP = 'dcw'

/** XDG config root ($XDG_CONFIG_HOME or ~/.config). Read lazily so tests can override. */
export function configHome(): string {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
}

/** XDG state root ($XDG_STATE_HOME or ~/.local/state). */
export function stateHome(): string {
  return process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state')
}

/** Directory holding per-environment manifests. */
export function environmentsDir(): string {
  return path.join(configHome(), APP, 'environments')
}

export function manifestPath(name: string): string {
  return path.join(environmentsDir(), `${name}.json`)
}

/** Per-environment derived state (generated Containerfile, build context). */
export function envStateDir(name: string): string {
  return path.join(stateHome(), APP, name)
}

/** Directory holding dcw's own SSH keypair + known_hosts used for editor attach. */
export function sshDir(): string {
  return path.join(configHome(), APP, 'ssh')
}

export function containerfilePath(name: string): string {
  return path.join(envStateDir(name), 'Containerfile')
}
