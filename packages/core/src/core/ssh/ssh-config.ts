import * as fs from 'node:fs/promises'
import os from 'node:os'
import * as path from 'node:path'

/** SSH host alias dcw writes for an environment (also the container/host-key id). */
export function hostAlias(name: string): string {
  return `dcw-${name}`
}

function sshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config')
}

export interface SshConfigEntry {
  name: string
  /** 'exec' → ProxyCommand over engine exec (no ports); 'port' → published TCP port. */
  mode: 'exec' | 'port'
  identityFile: string
  knownHostsFile: string
  /** Command ssh runs as ProxyCommand (exec mode), e.g. `dcw ssh-proxy my-env`. */
  proxyCommand?: string
  /** Published host port (port mode). */
  port?: number
}

/** Build the managed `Host` block (without markers) for an entry. */
export function renderEntry(entry: SshConfigEntry): string {
  const alias = hostAlias(entry.name)
  const lines = [`Host ${alias}`, '  User vscode']
  if (entry.mode === 'exec') {
    lines.push(`  ProxyCommand ${entry.proxyCommand}`)
  } else {
    lines.push('  HostName localhost', `  Port ${entry.port ?? 2222}`)
  }
  lines.push(
    `  IdentityFile ${entry.identityFile}`,
    '  IdentitiesOnly yes',
    `  UserKnownHostsFile ${entry.knownHostsFile}`,
    '  StrictHostKeyChecking accept-new',
  )
  return lines.join('\n')
}

/**
 * Insert or replace dcw's managed block for an environment in ~/.ssh/config,
 * delimited by `# >>> dcw <name> >>>` / `# <<< dcw <name> <<<` markers. Idempotent:
 * writing the same entry twice yields a single block. Returns the host alias.
 */
export async function writeSshConfig(entry: SshConfigEntry): Promise<string> {
  const file = sshConfigPath()
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })

  let existing = ''
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch {
    // no config yet
  }

  const block = mergeBlock(existing, entry.name, renderEntry(entry))
  await fs.writeFile(file, block, { mode: 0o600 })
  return hostAlias(entry.name)
}

/** Remove dcw's managed block for an environment from ~/.ssh/config (no-op if absent). */
export async function removeSshConfig(name: string): Promise<void> {
  const file = sshConfigPath()
  let existing: string
  try {
    existing = await fs.readFile(file, 'utf8')
  } catch {
    return
  }
  const next = stripBlock(existing, name)
  if (next !== existing) await fs.writeFile(file, next, { mode: 0o600 })
}

function markers(name: string): { begin: string; end: string } {
  return { begin: `# >>> dcw ${name} >>>`, end: `# <<< dcw ${name} <<<` }
}

function stripBlock(content: string, name: string): string {
  const { begin, end } = markers(name)
  const lines = content.split('\n')
  const out: string[] = []
  let skipping = false
  for (const line of lines) {
    if (line.trim() === begin) {
      skipping = true
      continue
    }
    if (skipping) {
      if (line.trim() === end) skipping = false
      continue
    }
    out.push(line)
  }
  // Collapse any blank gap left behind and trim trailing blank lines.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}

function mergeBlock(content: string, name: string, body: string): string {
  const { begin, end } = markers(name)
  const base = stripBlock(content, name)
  const managed = `${begin}\n${body}\n${end}`
  if (!base.trim()) return `${managed}\n`
  return `${base}\n\n${managed}\n`
}
