import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription"

export async function frameworks() {
  return await checkboxWithTopDescription({
    message: "Select frameworks",
    choices: [
      { name: "Foundry", value: "foundry", description: "Automatically installs: Rust" },
      { name: "Hardhat", value: "hardhat", description: "Automatically installs: Node.js, pnpm (package manager)" },
      { name: "Ape (ApeWorX)", value: "ape", description: "Automatically installs: Python, uv (package manager)" },
        ],
  });
}
