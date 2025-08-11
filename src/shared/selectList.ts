import { select, Separator } from '@inquirer/prompts'
import { devcontainerUp } from '@/shared/devcontainerUp'
import { openIn } from '@/shared/openIn'

export async function selectList() {
    const selected = await select({
    message: 'Select a pre-built container to start:',
    choices: [
        {
          name: 'Minimal 🧶',
          value: ".devcontainer/minimal/devcontainer.json",
          description: 'Contains a beginner friendly enviroment',
          disabled: false
        },
        {
          name: 'The Red Guild 🪷',
          value: ".devcontainer/theredguild/devcontainer.json",
          description: 'The Red Guild devcontainer',
          disabled: false
        },
        {
          name: 'Auditor 🔍',
          value: ".devcontainer/auditor/devcontainer.json",
          description: 'Contains an audit-ready environment.',
          disabled: false,
        },
        new Separator(),
        // TODO: Add the following configurations
        {
          name: 'Hardened 🛡️',
          value: ".devcontainer/hardened/devcontainer.json",
          description: '',
          disabled: '(this configuration is not released yet)',
        },
        {
          name: 'Paranoid ☣️',
          value: ".devcontainer/paranoid/devcontainer.json",
          description: '',
          disabled: '(this configuration is not released yet)',
        }
    ]});

    const openInSelection = await openIn()

    await devcontainerUp(selected, openInSelection)
}