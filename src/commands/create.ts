import {Args, Command} from '@oclif/core'
import {
  wizard
} from '@/core/wizard'
import { generateDevEnvironment } from '@/core/scripts/generate_dev_env'

export default class Create extends Command {
  static override args = {
    name: Args.string({ description: 'Devcontainer name' }),
  }
  static override description = 'Create a Solidity-focused devcontainer via an interactive wizard'
  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  public async run(): Promise<void> {
    try {
    const { args } = await this.parse(Create)

    const wizardState = await wizard(args)
    
    try {

      await generateDevEnvironment({ config: wizardState })
      
      console.log('\n✨ Devcontainer creation completed successfully!')
      console.log('🎉 Your custom Web3 development environment is ready!')
      
    } catch (error) {
      this.error(`Failed to create devcontainer: ${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
      this.log('You pressed CTRL+C 👋 Goodbye!')
      process.exit(0)
    } else {
      this.error(`Failed to start wizard: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}}
