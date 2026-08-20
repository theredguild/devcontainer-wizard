import { render } from 'ink'
import { createElement } from 'react'
import { detectHost } from '../engine/host.js'
import { surveyEngines } from '../engine/resolver.js'
import type { EnvSpec } from '../spec/env-spec.js'
import type { FlagInput } from '../spec/flags-to-spec.js'
import { App } from './App.js'

export interface MountWizardOptions {
  initial: FlagInput
}

/**
 * Render the ink wizard and resolve with the authored EnvSpec, or null if the
 * user cancels. Loaded via dynamic import so React/ink never touch the
 * non-interactive (JSON / no-TTY) code path.
 */
export async function mountWizard(opts: MountWizardOptions): Promise<EnvSpec | null> {
  const host = await detectHost()
  const engines = await surveyEngines({ host })

  return new Promise<EnvSpec | null>((resolve) => {
    let settled = false
    const finish = (value: EnvSpec | null) => {
      if (settled) return
      settled = true
      instance.unmount()
      resolve(value)
    }

    const instance = render(
      createElement(App, {
        initial: opts.initial,
        engines,
        onComplete: (spec) => finish(spec),
        onCancel: () => finish(null),
      }),
      { exitOnCtrlC: false },
    )
  })
}
