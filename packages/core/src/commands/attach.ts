import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { buildEnvironment } from '../core/build-pipeline.js'
import { planEnvironment } from '../core/plan.js'
import { findFreePort, isContainerRunning, resolveDcwInvocation } from '../core/ssh/attach.js'
import { detectEditor, EDITOR_IDS, editorDisplayName, launchEditor, type EditorId } from '../core/ssh/editors.js'
import { ensureKeypair, knownHostsPath } from '../core/ssh/keys.js'
import { provisionContainerSsh, startSshDaemon } from '../core/ssh/provision.js'
import { hostAlias, writeSshConfig } from '../core/ssh/ssh-config.js'
import { containerName, upEnvironment } from '../core/up-pipeline.js'
import { DcwError, ValidationError } from '../errors.js'
import type { EnvManifest, SshState } from '../state/manifest.js'
import { saveManifest } from '../state/store.js'

interface AttachJson {
  name: string
  engine: string
  host: string
  mode: 'exec' | 'port'
  port?: number
  user: string
  folder: string
  identityFile: string
  /** Ready-to-run command to connect manually. */
  ssh: string
  editor?: EditorId
  launched: boolean
}

export default class Attach extends BaseCommand {
  static description =
    'Attach an SSH-remote editor (Zed, VS Code, Cursor, Antigravity, …) to the environment container.'
  static examples = [
    '<%= config.bin %> attach',
    '<%= config.bin %> attach my-env --editor zed',
    '<%= config.bin %> attach my-env --print',
    '<%= config.bin %> attach my-env --port 2222',
  ]

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    editor: Flags.string({
      description: 'Editor to launch.',
      options: [...EDITOR_IDS, 'none'],
    }),
    folder: Flags.string({ description: 'Remote folder to open.', default: '/workspace' }),
    port: Flags.integer({
      description: 'Use a published TCP port instead of the default exec proxy (pass 0 to auto-allocate a free port).',
    }),
    print: Flags.boolean({ description: 'Print connection details only; do not launch an editor.', default: false }),
    workspace: Flags.string({ description: 'Host directory to mount at /workspace if the container must be started.' }),
  }

  async run(): Promise<AttachJson> {
    const { args, flags } = await this.parse(Attach)
    const name = await resolveEnvName(args.name)
    let manifest = await requireManifest(name)

    if (manifest.spec.ssh === false) {
      throw new ValidationError(
        `Environment '${name}' was created with --no-ssh, so its image has no SSH server. ` +
          'Recreate it without --no-ssh (or rebuild after enabling ssh) to use `dcw attach`.',
      )
    }

    const usePort = flags.port !== undefined
    const mode: SshState['mode'] = usePort ? 'port' : 'exec'

    const { driver, engineName, capabilities } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.engine ?? manifest.spec.engine,
    })

    // Ensure a running container wired the way this mode needs it.
    let port: number | undefined
    const running = await isContainerRunning(driver, name)
    if (usePort) {
      const existing = manifest.container?.ssh
      const reusable = running && existing?.mode === 'port' && (flags.port === 0 || existing.port === flags.port)
      if (reusable) {
        port = existing!.port
      } else {
        port = flags.port && flags.port > 0 ? flags.port : await findFreePort()
        manifest = await this.startContainer({ manifest, driver, engineName, capabilities, flags, sshPublishPort: port })
      }
    } else if (!running) {
      manifest = await this.startContainer({ manifest, driver, engineName, capabilities, flags })
    }

    const container = manifest.container?.id ?? manifest.container?.name ?? containerName(name)
    const alias = hostAlias(name)

    // Keys: dcw's own pair, public half installed into the container's authorized_keys.
    const keypair = await ensureKeypair()
    await provisionContainerSsh({ driver, container, publicKey: keypair.publicKey, hostAlias: alias })

    // Published-port mode needs a listening daemon; the exec proxy does not.
    if (usePort) await startSshDaemon(driver, container)

    // Managed ~/.ssh/config block so every editor resolves `dcw-<name>` identically.
    const proxyCommand = usePort ? undefined : await resolveDcwInvocation(name)
    await writeSshConfig({
      name,
      mode,
      identityFile: keypair.privateKeyPath,
      knownHostsFile: knownHostsPath(),
      proxyCommand,
      port,
    })

    // Record how the env is attached.
    if (manifest.container) {
      manifest = { ...manifest, container: { ...manifest.container, ssh: { mode, port } }, updatedAt: nowIso() }
      await saveManifest(manifest)
    }

    // Pick + launch an editor unless suppressed.
    const suppress = flags.print || this.jsonEnabled() || flags['no-input'] || flags.editor === 'none'
    let editor: EditorId | undefined
    let launched = false
    if (!suppress) {
      editor = (flags.editor as EditorId | undefined) ?? (await detectEditor())
      if (editor) {
        launched = await launchEditor({ editor, alias, folder: flags.folder })
        if (!launched && flags.editor) {
          throw new DcwError(`Editor '${editor}' is not installed (its CLI was not found on PATH).`)
        }
      }
    }

    const sshCmd = `ssh ${alias}`
    if (!this.jsonEnabled()) {
      this.log(`Ready: ${alias} (${mode === 'port' ? `localhost:${port}` : 'exec proxy'}) on ${driver.displayName}.`)
      if (launched && editor) this.log(`Launched ${editorDisplayName(editor)} → ${flags.folder}.`)
      else if (editor && flags.editor) this.log(`Could not launch ${editorDisplayName(editor)}.`)
      this.log(`\nConnect manually:  ${sshCmd}`)
      this.log(`VS Code / Cursor:  code --remote ssh-remote+${alias} ${flags.folder}`)
      this.log(`Zed:               zed ssh://${alias}${flags.folder}`)
    }

    return {
      name,
      engine: engineName,
      host: alias,
      mode,
      port,
      user: 'vscode',
      folder: flags.folder,
      identityFile: keypair.privateKeyPath,
      ssh: sshCmd,
      editor,
      launched,
    }
  }

  /** Build (if needed) and start the container, optionally publishing an SSH port. */
  private async startContainer(opts: {
    manifest: EnvManifest
    driver: Awaited<ReturnType<typeof resolveEngineFor>>['driver']
    engineName: Awaited<ReturnType<typeof resolveEngineFor>>['engineName']
    capabilities: Awaited<ReturnType<typeof resolveEngineFor>>['capabilities']
    flags: { strict?: boolean; workspace?: string }
    sshPublishPort?: number
  }): Promise<EnvManifest> {
    const { driver, engineName, capabilities, flags } = opts
    const name = opts.manifest.name
    const plan = planEnvironment(opts.manifest.spec)
    const now = nowIso()

    const built = await buildEnvironment({ manifest: opts.manifest, plan, driver, engineName, now })
    if (!this.jsonEnabled() && !built.skipped) this.log(`Built ${built.tag}.`)
    await saveManifest(built.manifest)

    await driver.rm(containerName(name), { force: true }).catch(() => undefined)
    const up = await upEnvironment({
      manifest: built.manifest,
      plan,
      driver,
      capabilities,
      engineName,
      workspaceDir: flags.workspace ?? process.cwd(),
      strict: flags.strict,
      sshPublishPort: opts.sshPublishPort,
      now,
    })
    await saveManifest(up.manifest)
    if (!this.jsonEnabled()) {
      this.log(`Started ${containerName(name)} on ${driver.displayName}.`)
      for (const w of up.translation.warnings) {
        this.warn(`${w.level === 'dropped' ? 'dropped' : 'note'} [${w.effect}]: ${w.message}`)
      }
    }
    return up.manifest
  }
}
