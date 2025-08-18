import {Command} from '@oclif/core'
import { selectList } from '@/shared/prebuiltList'
import { select } from '@inquirer/prompts'
import { selectStyle } from '@/styling/selectStyle'
import { brand } from '@/styling/colors'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Create } from '@/commands/create'

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
      await selectList()
    } else {
      await Create.run()
    }
  }
}
