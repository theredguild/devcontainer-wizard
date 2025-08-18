import { select } from "@inquirer/prompts";
import { selectStyle } from "@/ui/styling/selectStyle";

// Recipe to security hardening mapping
const RECIPE_MAPPINGS = {
  "airgapped-ephemeral-sandbox": {
    description: "Sealed box without network or persistence for maximum isolation.",
    caveat: "Extensions and package managers will not work.",
    choices: [
      "readonly-fs",
      "workspace-isolation-nowrite",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "network-none",
      "resource-limits",
      "vscode-security"
    ]
  },
  "hardened-online-dev": {
    description: "Day-to-day development with network access but reduced attack surface.",
    caveat: "Tools that craft packets will break due to no-raw-packets.",
    choices: [
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "no-raw-packets",
      "secure-dns",
      "vscode-security",
      "resource-limits"
    ]
  },
  "source-review-only": {
    description: "For reading code and running linters without writing to the repository.",
    caveat: "Compilers and formatters that write will fail.",
    choices: [
      "readonly-fs",
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "no-raw-packets",
      "secure-dns",
      "vscode-security"
    ]
  },
  "training-workshop-lab": {
    description: "For classroom or public workshops with predictable resource usage.",
    caveat: "Memory-hungry builds may OOM at 512 MB.",
    choices: [
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "secure-dns",
      "resource-limits",
      "vscode-security"
    ]
  },
  "network-restricted-analysis": {
    description: "For web APIs, git, and package installs without packet crafting capabilities.",
    caveat: "Packet-crafting tools will not work.",
    choices: [
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "no-raw-packets",
      "secure-dns",
      "resource-limits"
    ]
  },
  "ci-like-local-runner": {
    description: "Mirrors CI behavior locally with immutable file system.",
    caveat: "Cache writes will not persist across runs.",
    choices: [
      "readonly-fs",
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "secure-dns",
      "resource-limits"
    ]
  },
  "forensics-reader": {
    description: "Inspect artifacts offline without altering evidence.",
    caveat: "No network access or persistence.",
    choices: [
      "readonly-fs",
      "workspace-isolation-nowrite",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "network-none",
      "vscode-security"
    ]
  },
  "package-install-session": {
    description: "Allows installing packages while keeping guardrails in place.",
    caveat: "Omit drop-caps if installs fail unexpectedly.",
    choices: [
      "workspace-isolation",
      "secure-tmp",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "secure-dns",
      "resource-limits",
      "vscode-security"
    ]
  },
  "net-disabled-build-test": {
    description: "Prove builds succeed without network access.",
    caveat: "Build steps requiring downloads will fail.",
    choices: [
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "network-none",
      "resource-limits",
      "vscode-security"
    ]
  },
  "security-research-controlled-net": {
    description: "For API testing and collectors without packet crafting capability.",
    caveat: "Packet-crafting tools will not work.",
    choices: [
      "workspace-isolation",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "seccomp",
      "no-raw-packets",
      "secure-dns"
    ]
  }
} as const;

export async function recipes() {
  return await select({
    message: "Select one hardening recipe:",
    theme: selectStyle,
    loop: false,
    choices: [
      { 
        name: "Airgapped ephemeral sandbox", 
        value: "airgapped-ephemeral-sandbox", 
        description: "Sealed box without network or persistence for maximum isolation. Extensions and package managers will not work." 
      },
      { 
        name: "Hardened online dev", 
        value: "hardened-online-dev", 
        description: "Day-to-day development with network access but reduced attack surface. Tools that craft packets will break due to no-raw-packets." 
      },
      { 
        name: "Source-review only", 
        value: "source-review-only", 
        description: "For reading code and running linters without writing to the repository. Compilers and formatters that write will fail." 
      },
      { 
        name: "Training workshop lab", 
        value: "training-workshop-lab", 
        description: "For classroom or public workshops with predictable resource usage. Memory-hungry builds may OOM at 512 MB." 
      },
      { 
        name: "Network restricted analysis", 
        value: "network-restricted-analysis", 
        description: "For web APIs, git, and package installs without packet crafting capabilities. Packet-crafting tools will not work." 
      },
      { 
        name: "CI-like local runner", 
        value: "ci-like-local-runner", 
        description: "Mirrors CI behavior locally with immutable file system. Cache writes will not persist across runs." 
      },
      { 
        name: "Forensics reader", 
        value: "forensics-reader", 
        description: "Inspect artifacts offline without altering evidence. No network access or persistence." 
      },
      { 
        name: "Package-install session", 
        value: "package-install-session", 
        description: "Allows installing packages while keeping guardrails in place. Omit drop-caps if installs fail unexpectedly." 
      },
      { 
        name: "Net-disabled build test", 
        value: "net-disabled-build-test", 
        description: "Prove builds succeed without network access. Build steps requiring downloads will fail." 
      },
      { 
        name: "Security research with controlled net", 
        value: "security-research-controlled-net", 
        description: "For API testing and collectors without packet crafting capability. Packet-crafting tools will not work." 
      },   
    ],
  });
}

/**
 * Converts recipe selections to their corresponding security hardening choices
 * @param selectedRecipes Array of selected recipe keys
 * @returns Array of security hardening choice strings
 */
export function recipesToSecurityHardening(selectedRecipes: string[]): string[] {
  const hardeningChoices = new Set<string>();
  
  for (const recipe of selectedRecipes) {
    if (recipe in RECIPE_MAPPINGS) {
      const recipeMapping = RECIPE_MAPPINGS[recipe as keyof typeof RECIPE_MAPPINGS];
      recipeMapping.choices.forEach(choice => hardeningChoices.add(choice));
    }
  }
  
  return Array.from(hardeningChoices);
}

/**
 * Gets the description and caveat for a recipe
 * @param recipeKey The recipe key
 * @returns Object with description and caveat, or null if not found
 */
export function getRecipeInfo(recipeKey: string): { description: string; caveat: string } | null {
  if (recipeKey in RECIPE_MAPPINGS) {
    const recipe = RECIPE_MAPPINGS[recipeKey as keyof typeof RECIPE_MAPPINGS];
    return {
      description: recipe.description,
      caveat: recipe.caveat
    };
  }
  return null;
}
