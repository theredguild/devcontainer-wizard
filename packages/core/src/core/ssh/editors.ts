import { spawn } from 'node:child_process'
import { isOnPath } from '../../util/which.js'

export type EditorId = 'zed' | 'vscode' | 'cursor' | 'antigravity'

interface EditorDef {
  id: EditorId
  displayName: string
  /** Candidate CLI binaries, in priority order. */
  bins: string[]
  /** Build the argv that opens the remote `folder` on host `alias`. */
  args: (alias: string, folder: string) => string[]
}

/**
 * Editor launchers. Every entry resolves the container through the `~/.ssh/config`
 * host alias dcw writes, so the same SSH plumbing works for all of them. VS Code,
 * Cursor and Antigravity share the `--remote ssh-remote+<host>` form (Antigravity
 * is a VS Code fork); Zed takes an `ssh://` URL.
 */
const EDITORS: Record<EditorId, EditorDef> = {
  zed: {
    id: 'zed',
    displayName: 'Zed',
    bins: ['zed'],
    args: (alias, folder) => [`ssh://${alias}${folder}`],
  },
  vscode: {
    id: 'vscode',
    displayName: 'VS Code',
    bins: ['code'],
    args: (alias, folder) => ['--remote', `ssh-remote+${alias}`, folder],
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor',
    bins: ['cursor'],
    args: (alias, folder) => ['--remote', `ssh-remote+${alias}`, folder],
  },
  antigravity: {
    id: 'antigravity',
    displayName: 'Antigravity',
    bins: ['antigravity'],
    args: (alias, folder) => ['--remote', `ssh-remote+${alias}`, folder],
  },
}

export const EDITOR_IDS = Object.keys(EDITORS) as EditorId[]

async function resolveBin(bins: string[]): Promise<string | undefined> {
  for (const bin of bins) {
    if (await isOnPath(bin)) return bin
  }
  return undefined
}

/** First installed editor among the preferred order, or undefined if none found. */
export async function detectEditor(): Promise<EditorId | undefined> {
  for (const id of EDITOR_IDS) {
    if (await resolveBin(EDITORS[id].bins)) return id
  }
  return undefined
}

export function editorDisplayName(id: EditorId): string {
  return EDITORS[id].displayName
}

/**
 * Launch `editor` against the SSH host `alias`, opening `folder`. Spawns detached
 * so dcw can return immediately. Resolves false if no binary was found.
 */
export async function launchEditor(opts: {
  editor: EditorId
  alias: string
  folder: string
}): Promise<boolean> {
  const def = EDITORS[opts.editor]
  const bin = await resolveBin(def.bins)
  if (!bin) return false
  const child = spawn(bin, def.args(opts.alias, opts.folder), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return true
}
