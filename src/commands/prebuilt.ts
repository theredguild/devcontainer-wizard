import {Args, Command} from '@oclif/core'
import { selectList } from '../shared/selectList'
import { devcontainerUp } from '../shared/devcontainerUp'
import { select } from '@inquirer/prompts'

export default class Prebuilt extends Command {

  static override args = {
    container: Args.string({description: 'Container name to start (minimal, theredguild, auditor)'}),
  }
  static override description = 'Select a pre-built development container'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> minimal',
    '<%= config.bin %> <%= command.id %> theredguild',
    '<%= config.bin %> <%= command.id %> auditor',
  ]

  private containerMap: Record<string, string> = {
    'minimal': '.devcontainer/minimal/devcontainer.json',
    'theredguild': '.devcontainer/theredguild/devcontainer.json',
    'auditor': '.devcontainer/auditor/devcontainer.json'
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(Prebuilt)

    if (!args.container) {
      await selectList();
      return;
    }

    const containerConfig = this.containerMap[args.container.toLowerCase()];
    if (!containerConfig) {
      this.error(`Container "${args.container}" not found. Available containers: ${Object.keys(this.containerMap).join(', ')}`);
      return;
    }

    const openIn = await select({
      message: 'Select an interface to attach to the devcontainer:',
      choices: [
        { name: 'Terminal', value: 'shell' },
        { name: 'VS Code', value: 'code', disabled: true },
      ],
    });

    await devcontainerUp(containerConfig, openIn);
  }
}
