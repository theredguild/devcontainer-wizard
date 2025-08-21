import {Args, Command, Flags} from '@oclif/core'
import { prebuiltList } from '../core/devcontainer/prebuiltList'
import { devcontainerUp } from '../core/devcontainer/devcontainerUp'
import { openIn } from '@/utils/openIn'
import { copyPrebuiltContainer } from '@/core/devcontainer/resolvePrebuiltPath'

export default class Prebuilt extends Command {

  static override args = {
    container: Args.string({description: 'Container name to start (minimal, auditor, legacy-theredguild, legacy-minimal)'}),
  }
  static override flags = {
    list: Flags.boolean({
      char: 'l',
      description: 'List available pre-built containers and exit',
      default: false,
    }),
  }
  static override description = 'Select a pre-built development container from the theredguild/devcontainer repository'
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> minimal',
    '<%= config.bin %> <%= command.id %> auditor',
    '<%= config.bin %> <%= command.id %> legacy-theredguild',
    '<%= config.bin %> <%= command.id %> legacy-minimal',
  ]

  private containerMap: Record<string, string> = {
    'minimal': 'minimal',
    'auditor': 'auditor',
    'legacy-theredguild': 'legacy-theredguild',
    'legacy-minimal': 'legacy-minimal'
  }

  public async run(): Promise<void> {
    try {
    const {args, flags} = await this.parse(Prebuilt)

    if (flags.list) {
      this.log('Available pre-built devcontainers:')
      for (const key of Object.keys(this.containerMap)) {
        this.log(`  - ${key}`)
      }
      return
    }

    if (!args.container) {
      this.log('Select a pre-built devcontainer')
      await prebuiltList();
      return;
    }

    const containerName = args.container.toLowerCase();
    const containerKey = this.containerMap[containerName];
    
    if (!containerKey) {
      this.error(`Container "${containerName}" not found. Available containers: ${Object.keys(this.containerMap).join(', ')}`);
      return;
    }

    console.log(`📋 Copying ${containerName} devcontainer to current directory...`);
    const openInSelection = await openIn()

    try {
      const localConfigPath = await copyPrebuiltContainer(containerKey)
      console.log(`🚀 Starting ${containerName} devcontainer...`);
      await devcontainerUp(localConfigPath, openInSelection);
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
