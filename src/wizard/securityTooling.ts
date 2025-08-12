import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function securityTooling() {
  return await checkbox({
    message: "Select security tooling",
    theme: checkboxStyle,
    choices: [
      { name: "Slither", value: "slither", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Mythril", value: "mythril", description: "Automatically installs: Python, uv (package manager)" },
    ],
  });
}
