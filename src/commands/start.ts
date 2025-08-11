import {Command} from '@oclif/core'
import { selectList } from '@/shared/selectList'
import { select } from '@inquirer/prompts'
//import { lotus } from '@/art/lotus'

export default class Start extends Command {

  static override description = 'Start configuration wizard'

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Start)

    this.log("Welcome to [TBD] the CLI tool for init web3 development containers.")

    //const red = '\x1b[31m'
    //const reset = '\x1b[0m'
    //this.log(`${red}${lotus}${reset}`)

    

    const selected = await select({
      message: 'You can select a pre-built container or create your own',
      choices: [
        { name: 'Pre-built', value: 'pre-built' },
        { name: 'Create your own', value: 'custom', disabled: '(Coming soon)'},
      ],
    })

    if (selected === 'pre-built') {
      await selectList()
    }

  }
}
