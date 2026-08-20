import { describe, expect, it } from 'vitest'
import Exec from '../../src/commands/exec.js'
import Shell from '../../src/commands/shell.js'
import Logs from '../../src/commands/logs.js'
import Agent from '../../src/commands/agent.js'
import Create from '../../src/commands/create.js'

describe('streaming commands disable --json (#3)', () => {
  it('exec/shell/logs/agent are pass-through (no JSON envelope to corrupt exit codes)', () => {
    for (const Cmd of [Exec, Shell, Logs, Agent]) {
      expect(Cmd.enableJsonFlag, Cmd.name).toBe(false)
    }
  })

  it('but still accept --json as a no-op so agents do not hard-error (#N7)', () => {
    for (const Cmd of [Exec, Shell, Logs, Agent]) {
      expect(Cmd.flags?.json, Cmd.name).toBeDefined()
    }
  })

  it('create still supports --json', () => {
    expect(Create.enableJsonFlag).toBe(true)
  })
})
