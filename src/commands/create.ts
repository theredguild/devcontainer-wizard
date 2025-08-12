import {Command} from '@oclif/core'
import { languages } from '@/wizard/languages'
import { frameworks } from '@/wizard/frameworks'
import { fuzzingAndTesting } from '@/wizard/fuzzingTesting'
import { securityTooling } from '@/wizard/securityTooling'
import { systemHardening } from '@/wizard/systemHardening'
import { vibeCoding } from '@/wizard/vibeCoding'
import { vscodeExtensions } from '@/wizard/vscodeExtensions'

export default class Create extends Command {
  static override description = 'Create a Solidity-focused devcontainer via an interactive wizard'
  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  public async run(): Promise<void> {
    const selectedLanguages = await languages()
    const selectedFrameworks = await frameworks()
    const selectedFuzzingTesting = await fuzzingAndTesting()
    const selectedSecurityTooling = await securityTooling()
    const selectedSystemHardening = await systemHardening()
    const selectedVibeCoding = await vibeCoding()
    const selectedVscodeExtensions = await vscodeExtensions()

    this.log(JSON.stringify({
      languages: selectedLanguages,
      frameworks: selectedFrameworks,
      fuzzingAndTesting: selectedFuzzingTesting,
      securityTooling: selectedSecurityTooling,
      systemHardening: selectedSystemHardening,
      vibeCoding: selectedVibeCoding,
      vscodeExtensions: selectedVscodeExtensions,
    }, null, 2))
  }
}
