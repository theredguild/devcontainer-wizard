import { Command } from '@oclif/core'
import { exec } from 'child_process'

export default class Devcontainer extends Command {
  async run() {
    exec('ls', (error, stdout, stderr) => {
      if (error) {
        this.error(error.message)
      } else {
        this.log(stdout)
      }
    })
  }
}
