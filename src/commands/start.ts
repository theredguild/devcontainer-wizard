import {Command} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { select } from '@inquirer/prompts'
import { prebuiltList } from '@/shared/prebuiltList'
import {wizard} from '@/wizard'
import { selectStyle } from '@/styling/selectStyle'
import { brand } from '@/styling/colors'
import { generateDevEnvironment } from '@/scripts/generate_dev_env'


export default class Start extends Command {

  static override description = 'Start configuration wizard'

  public async run(): Promise<void> {

    try {
      const motdPath = path.resolve(__dirname, '..', 'art', 'motd')
      const motd = fs.readFileSync(motdPath, 'utf8')
      this.log(brand.primary(brand.bold(motd)))
    } catch {}
    this.log(brand.primary(brand.bold("Welcome to The Red Guild web3 devcontainer wizard")))    

    const selected = await select({
      message: 'You can select a pre-built container or create your own',
      theme: selectStyle,
      choices: [
        { name: 'Pre-built', value: 'pre-built' },
        { name: 'Create your own', value: 'custom'},
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
  }
}
