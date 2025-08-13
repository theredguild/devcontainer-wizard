import {Args, Command} from '@oclif/core'
import {
  languages,
  frameworks,
  fuzzingAndTesting,
  securityTooling,
  systemHardening,
  vibeCoding,
  vscodeExtensions,
  savePath,
  devcontainerName,
} from '@/wizard'

export default class Create extends Command {
  static override args = {
    name: Args.string({ description: 'Optional devcontainer name' }),
  }
  static override description = 'Create a Solidity-focused devcontainer via an interactive wizard'
  static override examples = [
    '<%= config.bin %> <%= command.id %>'
  ]

  public async run(): Promise<void> {
    const { args } = await this.parse(Create)
    const selectedDevcontainerName = args.name ?? await devcontainerName()
    const selectedLanguages = await languages()
    const selectedFrameworks = await frameworks()
    const selectedFuzzingTesting = await fuzzingAndTesting()
    const selectedSecurityTooling = await securityTooling()
    const selectedSystemHardening = await systemHardening()
    const selectedVibeCoding = await vibeCoding()
    const selectedVscodeExtensions = await vscodeExtensions()
    const selectedSavePath = await savePath()

    this.log(JSON.stringify({
      name: selectedDevcontainerName,
      languages: selectedLanguages,
      frameworks: selectedFrameworks,
      fuzzingAndTesting: selectedFuzzingTesting,
      securityTooling: selectedSecurityTooling,
      systemHardening: selectedSystemHardening,
      vibeCoding: selectedVibeCoding,
      vscodeExtensions: selectedVscodeExtensions,
      savePath: selectedSavePath,
    }, null, 2))
  }
}
