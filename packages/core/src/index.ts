import { Command, Args, Flags } from '@oclif/core'
import { prebuiltList } from '@/core/devcontainer/prebuiltList'
import { wizard } from '@/core/wizard'
import { generateDevEnvironment } from '@/core/scripts/generate_dev_env'
import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { colorize, symbols } from '@/ui/components'
import { ui } from '@/ui/styling/ui'
import { checkForUpdates } from '@/utils/versionCheck'

export default class DevcontainerWizard extends Command {

  static override description = 'DevContainer Wizard - Create custom containers or use pre-built ones'

  static override examples = [
    '$ devcontainer-wizard create',
    '$ devcontainer-wizard prebuilt',
    '$ devcontainer-wizard create --name my-project'
  ]

  static override args = {
    action: Args.string({
      description: 'Action to perform: create (custom container) or prebuilt (use pre-built container)',
      required: false,
      options: ['create', 'prebuilt'],
    }),
  }

  static override flags = {
    name: Flags.string({
      description: 'Name. For create: project name. For prebuilt: prebuilt ID.',
      char: 'N',
    }),
    list: Flags.boolean({
      description: 'List available prebuilt containers and exit',
      char: 'L',
      default: false,
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse()

    try {


      if (args.action === 'prebuilt') {
        if (flags.list) {
          await prebuiltList({ listOnly: true });
          return;
        }
        await this.runPrebuiltFlow(flags.name);
      } else if (args.action === 'create') {
        await this.runCreateFlow(flags.name);
      } else {
        await this.runMainMenu(flags.name);
      }
    } catch (error) {
      if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
        this.log('\nExited with CTRL+C 👋')
        process.exit(0)
      } else {
        this.error(`Failed to start wizard: ${error instanceof Error ? error.message : String(error)}`)
      }
    }   
  }

  private async runMainMenu(name?: string): Promise<void> {
    const BACK = Symbol.for('back');
    while (true) {
      ui.clearScreen()
      this.log(colorize.brand(`
        ╭───────────────────────────────────────────╮
        │    ✻ Welcome to Devcontainer Wizard 🪷    │
        ╰───────────────────────────────────────────╯
        `));
      
      // Check for updates (non-blocking, fails silently)
      const updateInfo = await checkForUpdates().catch(() => null);
      if (updateInfo && updateInfo.hasUpdate) {
        this.log(colorize.warning(`        ${symbols.star} A new version is available!`))
        this.log(colorize.muted(`        Current: ${updateInfo.currentVersion} ${symbols.arrow} Latest: ${updateInfo.latestVersion}`))
        this.log(colorize.muted(`        Run: ${colorize.accent(updateInfo.updateCommand)}`))
        this.log('')
      }
      
      const selected = await selectWithTopDescription({
        message: 'You can select a pre-built container or create your own',
        choices: [
          { name: 'Create a custom container', value: 'custom'},
          { name: 'Use a pre-built container', value: 'pre-built' },
        ],
        footer: { back: false, exit: true },
        allowBack: false,
      })

      if (selected === 'pre-built') {
        const result = await this.runPrebuiltFlow();
        if (result === Symbol.for('back')) {
          continue;
        }
        break;
      } else {
        await this.runCreateFlow(name);
        break; 
      }
    }
  }

  private async runPrebuiltFlow(selectedName?: string): Promise<any> {
    // Check for updates once at the start (non-blocking, fails silently)
    const updateInfo = await checkForUpdates().catch(() => null);
    
    while (true) {
      try {
        ui.clearScreen()
        
        if (updateInfo && updateInfo.hasUpdate) {
          this.log(colorize.warning(`${symbols.star} A new version is available!`))
          this.log(colorize.muted(`  Current: ${updateInfo.currentVersion} ${symbols.arrow} Latest: ${updateInfo.latestVersion}`))
          this.log(colorize.muted(`  Run: ${colorize.accent(updateInfo.updateCommand)}`))
          this.log('')
        }
        
        const selection = await prebuiltList({ selected: selectedName });
        if (selection === Symbol.for('back')) {
          return Symbol.for('back');
        }
        break; // Exit the loop after successful completion
      } catch (error) {
        if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
          this.log('\nExited with CTRL+C 👋')
          process.exit(0)
        } else {
          throw error;
        }
      }
    }
  }

  private async runCreateFlow(name?: string): Promise<void> {
    try {
      ui.clearScreen()
      
      // Check for updates (non-blocking, fails silently)
      const updateInfo = await checkForUpdates().catch(() => null);
      if (updateInfo && updateInfo.hasUpdate) {
        this.log(colorize.warning(`${symbols.star} A new version is available!`))
        this.log(colorize.muted(`  Current: ${updateInfo.currentVersion} ${symbols.arrow} Latest: ${updateInfo.latestVersion}`))
        this.log(colorize.muted(`  Run: ${colorize.accent(updateInfo.updateCommand)}`))
        this.log('')
      }
      
      const wizardState = await wizard({ name: name || undefined })
      console.log('')
      
      ui.clearScreen()
      await generateDevEnvironment({ config: wizardState })
      console.log('')
      
      console.log(colorize.success(symbols.check + ' Devcontainer creation completed successfully!'))
      console.log('')
      
    } catch (error) {
      if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
        this.log('\nExited with CTRL+C 👋')
        process.exit(0)
      } else {
        this.error(`Failed to create devcontainer: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}
