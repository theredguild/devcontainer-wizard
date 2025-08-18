import {select} from '@inquirer/prompts'
import { selectStyle } from '@/ui/styling/selectStyle'

export async function openIn() {
    return await select({
        message: 'Select an interface to attach to the devcontainer:',
        theme: selectStyle,
        choices: [
            { name: 'Terminal', value: 'shell' },
            { name: 'VS Code', value: 'code' },
        ],
    })
}