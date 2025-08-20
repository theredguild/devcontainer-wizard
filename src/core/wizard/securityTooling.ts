import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";
import { checkboxStyle } from "@/ui/styling/checkboxStyle";

export async function securityTooling() {
  return await checkboxWithTopDescription({
    message: "Select security tooling",
    choices: [
      { name: "Slither", value: "slither", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Mythril", value: "mythril", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Crytic", value: "crytic-compile", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Panoramix", value: "panoramix", description: "Automatically installs: Python, uv (package manager), Panoramix VS Code extension"},
      { name: "Semgrep", value: "semgrep", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Heimdall", value: "heimdall", description: "Automatically installs: Rust"}
    ],
  });
}
