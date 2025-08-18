import {Args, Command, Flags} from '@oclif/core'
import { prebuiltList } from '../shared/prebuiltList'
import { devcontainerUp } from '../shared/devcontainerUp'
import { openIn } from '@/shared/openIn'
import { brand } from '@/styling/colors'

export default class Prebuilt extends Command {

  static override args = {
    container: Args.string({description: 'Container name to start (minimal, theredguild, auditor)'}),
  }
  static override flags = {
    list: Flags.boolean({
      char: 'l',
      description: 'List available pre-built containers and exit',
      default: false,
    }),
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
    try {
    const {args, flags} = await this.parse(Prebuilt)

    if (flags.list) {
      this.log(brand.primary(brand.bold('Available pre-built devcontainers:')))
      for (const key of Object.keys(this.containerMap)) {
        const path = this.containerMap[key]
        this.log(`  - ${brand.bold(key)} ${brand.muted(`(${path})`)}`)
      }
      return
    }

    if (!args.container) {
      this.log(brand.primary(brand.bold('Select a pre-built devcontainer')))
      await prebuiltList();
      return;
    }

    const containerConfig = this.containerMap[args.container.toLowerCase()];
    if (!containerConfig) {
      this.error(brand.error(`Container "${args.container}" not found. Available containers: ${Object.keys(this.containerMap).join(', ')}`));
      return;
    }

    console.log(`🚀 Starting ${args.container} devcontainer...`);
    const openInSelection = await openIn()

    try {
      await devcontainerUp(containerConfig, openInSelection);
      console.log('✨ Devcontainer started successfully!');
    } catch (error) {
      if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
        this.log('You pressed CTRL+C 👋 Goodbye!')
        process.exit(0)
      } else {
        this.error(`Failed to start devcontainer: ${error instanceof Error ? error.message : String(error)}`)
      }
    }   
  } catch (error) {
    if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
      this.log('You pressed CTRL+C 👋 Goodbye!')
      process.exit(0)
    } else {
      this.error(`Failed to start devcontainer: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  }
}
