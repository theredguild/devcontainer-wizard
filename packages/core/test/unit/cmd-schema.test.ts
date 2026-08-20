import { describe, expect, it } from 'vitest'
import Schema from '../../src/commands/schema.js'
import { runCommand } from '../helpers/command.js'
import type { SchemaDoc } from '../../src/spec/schema-doc.js'

describe('dcw schema', () => {
  it('returns the machine-readable schema doc stamped with the CLI version', async () => {
    const { result, logs } = await runCommand<SchemaDoc>(Schema, { json: true, version: '9.9.9' })
    expect(result?.version).toBe('9.9.9')
    expect(result?.catalog.length).toBeGreaterThan(0)
    expect(result?.engines).toContain('docker')
    // Under --json oclif serializes the return value; the command must not also
    // print it, or the stream would carry the document twice.
    expect(logs).toHaveLength(0)
  })

  it('prints the same document as pretty JSON when --json is absent', async () => {
    const { result, logs } = await runCommand<SchemaDoc>(Schema, { json: false, version: '9.9.9' })
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0]!)).toEqual(result)
    expect(logs[0]).toContain('\n  ')
  })
})
