import { capture } from '../engine/exec.js'

/**
 * True when `bin` is resolvable on PATH.
 *
 * Tries `command -v` first, then `which`. `command` is a POSIX shell builtin: macOS
 * ships a `/usr/bin/command` binary, but most Linux distros do not, so spawning it
 * fails there. Without the `which` fallback, callers silently take their "not on
 * PATH" branch on Linux even when the binary is present.
 */
export async function isOnPath(bin: string): Promise<boolean> {
  const viaCommand = await capture('command', ['-v', bin])
  if (!viaCommand.spawnError && viaCommand.code === 0 && viaCommand.stdout.trim()) return true
  const viaWhich = await capture('which', [bin])
  return viaWhich.code === 0 && viaWhich.stdout.trim().length > 0
}
