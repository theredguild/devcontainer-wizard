import { BaseCommand } from '../base-command.js'
import { buildSchemaDoc, type SchemaDoc } from '../spec/schema-doc.js'

export default class Schema extends BaseCommand {
  static description = 'Print the machine-readable schema of all environment options (for agents/tooling).'
  static examples = ['<%= config.bin %> schema', '<%= config.bin %> schema --json']

  async run(): Promise<SchemaDoc> {
    const doc = buildSchemaDoc(this.config.version)
    // Always emit JSON — this command is machine-facing.
    if (!this.jsonEnabled()) {
      this.log(JSON.stringify(doc, null, 2))
    }
    return doc
  }
}
