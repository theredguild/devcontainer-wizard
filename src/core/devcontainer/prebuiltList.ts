import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { devcontainerUp } from '@/core/devcontainer/devcontainerUp'
import { openIn } from '@/utils/openIn'
import { copyPrebuiltContainer } from '@/core/devcontainer/resolvePrebuiltPath'
import { colorize, symbols } from '@/ui/components'
import { ui } from '@/ui/styling/ui'

export async function prebuiltList() {
    const selected = await selectWithTopDescription({
        message: 'Select a pre-built container to start:',
        choices: [
            {
              name: 'Minimal 🧶',
              value: 'minimal',
              description: 'Contains a beginner friendly environment.',
              disabled: false
            },
            {
              name: 'Auditor 🔍',
              value: 'auditor',
              description: 'Contains an audit-ready environment.',
              disabled: false,
            },
            {
              name: 'Legacy 🪷',
              value: 'legacy',
              description: 'The Red Guild\'s original devcontainer. (Legacy)',
              disabled: false
            },
            {
              name: 'Legacy Minimal 🧶',
              value: 'legacy-minimal',
              description: 'The Red Guild\'s original minimal devcontainer. (Legacy)',
              disabled: false
            }
        ]
    });

    console.log(colorize.brand(symbols.bullet + ' Copying selected devcontainer to current directory...'));
    const openInSelection = await openIn()

    console.log(colorize.brand(symbols.arrow + ' Starting selected devcontainer...'));
    try {
      const localConfigPath = await copyPrebuiltContainer(selected)
      await devcontainerUp(localConfigPath, openInSelection);
      console.log(colorize.success(symbols.check + ' Devcontainer started successfully!'));
      console.log('')
    } catch (error) {
      console.error(colorize.error(symbols.circle + ' Failed to start devcontainer: ' + (error instanceof Error ? error.message : String(error))));
      console.log('')
    }
}