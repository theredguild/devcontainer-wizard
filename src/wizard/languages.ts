import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function languages() {
    return await checkbox({
    message: 'Select smart contract languages',
    theme: checkboxStyle,
    choices: [
        { name: 'Solidity', value: 'solidity', description: 'Dependences: solc, solc-select' },
        { name: 'Vyper', value: 'vyper', description: 'Dependences: python, python3-dev, libpython3-dev, uv' }
    ],
    });
}