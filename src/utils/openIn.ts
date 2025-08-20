import {select} from '@inquirer/prompts'

export async function openIn() {
    return await select({
        message: 'Select an interface to attach to the devcontainer:',
        choices: [
            { name: 'Terminal', value: 'shell' },
            { name: 'VS Code', value: 'code' },
        ],
    })
}