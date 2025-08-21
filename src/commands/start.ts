import { Command } from '@oclif/core'
import { prebuiltList } from '@/core/devcontainer/prebuiltList'
import { wizard } from '@/core/wizard'
import { generateDevEnvironment } from '@/core/scripts/generate_dev_env'
import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'

export default class Start extends Command {

  static override description = 'Start configuration wizard'

  public async run(): Promise<void> {

    try {

      this.log(`
      ╭───────────────────────────────────────────╮
      │    ✻ Welcome to devcontainer-wizard 🪷    │
      ╰───────────────────────────────────────────╯
      `)    
      

    const selected = await selectWithTopDescription({
      message: 'You can select a pre-built container or create your own',
      choices: [
        { name: 'Create a custom container', value: 'custom'},
        { name: 'Use a pre-built container', value: 'pre-built' },
      ],
    })

    if (selected === 'pre-built') {
      await prebuiltList()
    } else {
      const wizardState = await wizard({ name: undefined })

      try {

        await generateDevEnvironment({ config: wizardState })
        
        console.log('\n✨ Devcontainer creation completed successfully!')
        console.log('🎉 Your custom Web3 development environment is ready!')
        
      } catch (error) {
        this.error(`Failed to create devcontainer: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
      this.log('You pressed CTRL+C 👋 Goodbye!')
      process.exit(0)
    } else {
      this.error(`Failed to start wizard: ${error instanceof Error ? error.message : String(error)}`)
    }
  }   
}
}
