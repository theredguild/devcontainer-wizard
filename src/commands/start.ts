import {Command} from '@oclif/core'
import { selectList } from '@/shared/selectList'
import { select } from '@inquirer/prompts'
import { selectStyle } from '@/styling/selectStyle'
import { brand } from '@/styling/colors'
import { setupCtrlC } from '@/shared/ctrlc'

export default class Start extends Command {

  static override description = 'Start configuration wizard'

  public async run(): Promise<void> {
    setupCtrlC()

    this.log(brand.primary(brand.bold("Welcome to The Red Guild web3 devcontainer wizard")))

    

    const selected = await select({
      message: 'You can select a pre-built container or create your own',
      theme: selectStyle,
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
