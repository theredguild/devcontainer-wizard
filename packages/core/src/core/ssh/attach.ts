import { createServer } from 'node:net'
import { capture } from '../../engine/exec.js'
import type { EngineDriver } from '../../engine/types.js'
import { ENV_LABEL } from '../up-pipeline.js'

/** Whether the env's container is currently running on the given engine. */
export async function isContainerRunning(driver: EngineDriver, envName: string): Promise<boolean> {
  const found = await driver.ps({ label: `${ENV_LABEL}=${envName}`, all: true })
  return found.some((c) => /\bup\b|running/i.test(c.status))
}

/** Ask the OS for a free TCP port (bind :0, read it back, release). */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('Could not determine a free port.')))
      }
    })
  })
}

/**
 * The command string SSH should run as ProxyCommand to reach `dcw ssh-proxy`.
 * Prefers `dcw` on PATH (stable across upgrades); otherwise falls back to the
 * absolute `<node> <entry-script>` of the currently running process so it also
 * works for local/dev installs that aren't on PATH.
 */
export async function resolveDcwInvocation(name: string): Promise<string> {
  const onPath = await capture('command', ['-v', 'dcw'])
  if (onPath.code === 0 && onPath.stdout.trim()) {
    return `dcw ssh-proxy ${name}`
  }
  const entry = process.argv[1]
  // ssh runs ProxyCommand via `/bin/sh -c`, so a node/entry path containing
  // spaces (e.g. /Users/First Last/…) would word-split — quote both components.
  if (entry) return `${shQuote(process.execPath)} ${shQuote(entry)} ssh-proxy ${name}`
  return `dcw ssh-proxy ${name}`
}

/** POSIX single-quote a string so it survives `/bin/sh -c` unsplit. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}
