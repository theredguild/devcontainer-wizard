import {Args, Command} from '@oclif/core'
import {
  languages,
  frameworks,
  fuzzingAndTesting,
  securityTooling,
  systemHardening,
  vscodeExtensions,
  savePath,
  devcontainerName,
} from '@/wizard'
import { generateDevEnvironment } from '@/scripts/generate_dev_env'
import { WizardState } from '@/types'



export default class Create extends Command {
  static override args = {
    name: Args.string({ description: 'Devcontainer name' }),
  }
  static override description = 'Create a Solidity-focused devcontainer via an interactive wizard'
  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  public async run(): Promise<void> {
    const { args } = await this.parse(Create)
    
    try {
      console.log('🧙‍♂️ Starting Web3 devcontainer creation wizard...')
      
      const selectedDevcontainerName = args.name ?? await devcontainerName()
      const selectedLanguages = await languages()
      const selectedFrameworks = await frameworks()
      const selectedFuzzingTesting = await fuzzingAndTesting()
      const selectedSecurityTooling = await securityTooling()
      const selectedSystemHardening = await systemHardening()
      const selectedVscodeExtensions = await vscodeExtensions()
      const selectedSavePath = await savePath()
      
      // Create wizard state object
      const wizardState: WizardState = {
        name: selectedDevcontainerName,
        languages: selectedLanguages,
        frameworks: selectedFrameworks,
        fuzzingAndTesting: selectedFuzzingTesting,
        securityTooling: selectedSecurityTooling,
        systemHardening: selectedSystemHardening,
        vscodeExtensions: selectedVscodeExtensions,
        savePath: selectedSavePath
      }
      
      await generateDevEnvironment({ config: wizardState })
      
      console.log('\n✨ Devcontainer creation completed successfully!')
      console.log('🎉 Your custom Web3 development environment is ready!')
      
    } catch (error) {
      this.error(`Failed to create devcontainer: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
