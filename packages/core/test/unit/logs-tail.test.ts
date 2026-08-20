import { describe, expect, it } from 'vitest'
import Logs from '../../src/commands/logs.js'

describe('logs --tail bounds (#bug5)', () => {
  it('declares a lower bound so a negative value is rejected by oclif, not forwarded to the engine', () => {
    // The integer flag must carry min:0 so `--tail -5` fails cleanly at parse time
    // instead of being passed through to docker/podman `logs --tail -5`.
    const tail = Logs.flags.tail as { min?: number }
    expect(tail.min).toBe(0)
  })
})
