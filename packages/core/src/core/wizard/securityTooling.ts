import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";

export async function securityTooling(state: {securityTooling?: string[]}) {
  return await checkboxWithTopDescription({
    message: "Select security tooling",
    choices: [
      { name: "Slither", value: "slither", description: "Automatically installs: Python, uv (package manager)", checked: state.securityTooling?.includes("slither") },
      { name: "Mythril", value: "mythril", description: "Automatically installs: Python, uv (package manager)", checked: state.securityTooling?.includes("mythril") },
      { name: "Crytic", value: "crytic-compile", description: "Automatically installs: Python, uv (package manager)", checked: state.securityTooling?.includes("crytic-compile") },
      { name: "Panoramix", value: "panoramix", description: "Automatically installs: Python, uv (package manager), Panoramix VS Code extension", checked: state.securityTooling?.includes("panoramix") },
      { name: "Semgrep", value: "semgrep", description: "Automatically installs: Python, uv (package manager)", checked: state.securityTooling?.includes("semgrep") },
      { name: "Heimdall", value: "heimdall", description: "Automatically installs: Rust", checked: state.securityTooling?.includes("heimdall") }
    ],
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true,
  });
}
