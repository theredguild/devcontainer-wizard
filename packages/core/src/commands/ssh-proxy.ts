import { Args } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { SSHD_CONFIG_PATH } from '../containerfile/base.js'
import { NotFoundError } from '../errors.js'

/**
 * Hidden ProxyCommand target for `dcw attach` (default, no-port mode). SSH runs
 * `dcw ssh-proxy <name>` and wires our stdin/stdout to the connection; we exec a
 * one-shot `sshd -i` (inetd mode) as the vscode user inside the container, so the
 * SSH session rides the engine's exec channel — no listening daemon, no open port,
 * works under network-none. Writes nothing to stdout but the SSH protocol stream.
 */
export default class SshProxy extends BaseCommand {
  static description = 'Internal: stdio SSH proxy into an environment container (used by `dcw attach`).'
  static hidden = true

  static args = {
    name: Args.string({ required: true, description: 'Environment name.' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SshProxy)
    const name = await resolveEnvName(args.name)
    const manifest = await requireManifest(name)
    if (!manifest.container?.name) {
      throw new NotFoundError(`Environment '${name}' has no container. Start it with \`dcw up ${name}\`.`)
    }
    const { driver } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.engine ?? manifest.spec.engine,
    })
    const target = manifest.container.id ?? manifest.container.name
    const code = await driver.exec({
      container: target,
      cmd: ['/usr/sbin/sshd', '-i', '-f', SSHD_CONFIG_PATH],
      interactive: true,
      tty: false,
      user: 'vscode',
    })
    this.exit(code)
  }
}
