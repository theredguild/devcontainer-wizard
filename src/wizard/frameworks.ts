import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function frameworks() {
  return await checkbox({
    message: "Select frameworks",
    theme: checkboxStyle,
    choices: [
      { name: "Foundry", value: "foundry", description: "Automatically installs: Rust" },
      { name: "Hardhat", value: "hardhat", description: "Automatically installs: Node.js, pnpm (package manager)" },
      { name: "Ape (ApeWorX)", value: "ape", description: "Automatically installs: Python, uv (package manager)" },
        ],
  });
}
