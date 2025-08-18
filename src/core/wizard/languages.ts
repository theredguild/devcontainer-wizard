import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/ui/styling/checkboxStyle";

export async function languages() {
  return await checkbox({
    message: 'Select smart contract languages',
    theme: checkboxStyle,
    choices: [
        { name: 'Solidity', value: 'solidity', description: 'Automatically installs: solc, solc-select' },
        { name: 'Vyper', value: 'vyper', description: 'Automatically installs: python, python3-dev, libpython3-dev, uv' }
    ],
    });
}