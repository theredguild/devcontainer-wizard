import {Args, Command} from '@oclif/core'
import { prebuilt } from '../shared/prebuilt'

export default class Select extends Command {

  static override args = {
    file: Args.string({description: 'file to read'}),
  }
  static override description = 'Select pre-built development container'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const {args} = await this.parse(Select)

    prebuilt();
  }
}
