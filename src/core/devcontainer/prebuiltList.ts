import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { devcontainerUp } from '@/core/devcontainer/devcontainerUp'
import { openIn } from '@/utils/openIn'
import { copyPrebuiltContainer } from '@/core/devcontainer/resolvePrebuiltPath'
import { colorize, symbols } from '@/ui/components'
import { ui } from '@/ui/styling/ui'
import { shouldRun } from '@/utils/shouldRun'

export async function prebuiltList() {
    const selected = await selectWithTopDescription({
        message: 'Select a pre-built container to start:',
        choices: [
            {
              name: 'Minimal 🧶',
              value: 'minimal',
              description: 'Essential development with basic security.',
              disabled: false
            },
            {
              name: 'Auditor 🔍',
              value: 'auditor',
              description: 'Smart contract auditors and security researchers.',
              disabled: false,
            },
            {
              name: 'Hardened 💻️',
              value: 'hardened',
              description: 'Enhanced security with development flexibility.',
              disabled: false,
            },
            {
              name: 'Isolated 🔒',
              value: 'isolated',
              description: 'Maximum security isolation, air-gapped environments.',
              disabled: false,
            },
            {
              name: 'Legacy 🪷',
              value: 'legacy',
              description: 'The Red Guild\'s original devcontainer. (Legacy)',
              disabled: false
            },
        ]
    });

    console.log(colorize.brand(symbols.bullet + ' Copying selected devcontainer to current directory...'));
    console.log(colorize.brand(symbols.check + ' Selected devcontainer copied successfully!'));
    try {
      const localConfigPath = await copyPrebuiltContainer(selected)
      await shouldRun(localConfigPath);
    } catch (error) {
      console.error(colorize.error(symbols.circle + ' Failed to copy devcontainer: ' + (error instanceof Error ? error.message : String(error))));
      console.log('')
    }
}