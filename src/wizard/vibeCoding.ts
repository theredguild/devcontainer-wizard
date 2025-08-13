import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function vibeCoding() {
  return await checkbox({
    message: "Select vibe-coding goodies",
    theme: checkboxStyle,
    choices: [
      { name: "Chonky (agent)", value: "chonky", description: "Automatically installs: node, pnpm (package manager)" },
      { name: "Cursor (IDE)", value: "cursor", description: "Automatically installs: node, pnpm (package manager)" },
      { name: "Cursor Agent (CLI)", value: "cursor-agent", description: "Automatically installs: node, pnpm (package manager)" },
      { name: "Claude Code", value: "claude-code", description: "Automatically installs: node, pnpm (package manager)" },
      { name: "Gemini Code", value: "gemini-code", description: "Automatically installs: curl" },
      { name: "Github Copilot (VS Code extension)", value: "github-copilot", description: "Automatically installs: node, pnpm (package manager), curl" },
    ],
  });
}
