import { Separator } from "@inquirer/core";
import { selectWithTopDescription } from "@/ui/components/selectWithTopDescription";

// Recipe to security hardening mapping
const RECIPE_MAPPINGS = {
  "network-restricted-analysis": {
    description: "For web APIs, git, and package installs without packet crafting capabilities.",
    caveat: "Packet-crafting tools will not work.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "no-raw-packets",
      "secure-dns"
    ]
  },
  "ci-like-local-runner": {
    description: "Mirrors CI behavior locally with immutable file system.",
    caveat: "Cache writes will not persist across runs.",
    choices: [
      "readonly-os",
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "secure-dns"
    ]
  },
  "package-install-session": {
    description: "Allows installing packages while keeping guardrails in place.",
    caveat: "Omit drop-caps if installs fail unexpectedly.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "no-new-privs",
      "apparmor",
      "secure-dns",
      "vscode-security"
    ]
  },
  "security-research-controlled-net": {
    description: "For API testing and collectors without packet crafting capability.",
    caveat: "Packet-crafting tools will not work.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "no-raw-packets",
      "secure-dns"
    ]
  },
  "development": {
    description: "Balanced security for daily development work",
    caveat: "Standard development environment with basic security hardening.",
    choices: [
      "secure-tmp",
      "no-new-privs",
      "apparmor",
      "secure-dns",
      "vscode-security"
    ]
  },
  "hardened": {
    description: "Enhanced security for smart contract auditing and security research",
    caveat: "Packet-crafting tools will not work due to no-raw-packets restriction.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "no-raw-packets",
      "secure-dns",
      "vscode-security"
    ]
  },
  "isolated": {
    description: "Maximum security with air-gapped environment",
    caveat: "No network access or persistent storage - extensions and package managers will not work.",
    choices: [
      "readonly-os",
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "network-none",
      "vscode-security"
    ]
  }
} as const;

export async function securityProfiles() {
  return await selectWithTopDescription({
    message: "Select one security profile:",
    loop: false,
    choices: [
      { 
        name: "Development", 
        value: "development", 
        description: RECIPE_MAPPINGS["development"].description,
        caveat: RECIPE_MAPPINGS["development"].caveat
      },
      { 
        name: "Hardened", 
        value: "hardened", 
        description: RECIPE_MAPPINGS["hardened"].description,
        caveat: RECIPE_MAPPINGS["hardened"].caveat
      },
      { 
        name: "Isolated", 
        value: "isolated", 
        description: RECIPE_MAPPINGS["isolated"].description,
        caveat: RECIPE_MAPPINGS["isolated"].caveat
      },
      new Separator("——— Experimental Profiles ———"),
      { 
        name: "Network Restricted Analysis", 
        value: "network-restricted-analysis", 
        description: RECIPE_MAPPINGS["network-restricted-analysis"].description,
        caveat: RECIPE_MAPPINGS["network-restricted-analysis"].caveat
      },
      { 
        name: "CI-like Local Runner", 
        value: "ci-like-local-runner", 
        description: RECIPE_MAPPINGS["ci-like-local-runner"].description,
        caveat: RECIPE_MAPPINGS["ci-like-local-runner"].caveat
      },
      { 
        name: "Package Install Session", 
        value: "package-install-session", 
        description: RECIPE_MAPPINGS["package-install-session"].description,
        caveat: RECIPE_MAPPINGS["package-install-session"].caveat
      },
      { 
        name: "Security Research (Controlled Net)", 
        value: "security-research-controlled-net", 
        description: RECIPE_MAPPINGS["security-research-controlled-net"].description,
        caveat: RECIPE_MAPPINGS["security-research-controlled-net"].caveat
      }
    ],
  });
}

export function recipesToSecurityHardening(selectedRecipes: string[]): string[] {
  const hardeningChoices = new Set<string>();
  
  for (const recipe of selectedRecipes) {
    if (recipe in RECIPE_MAPPINGS) {
      const recipeMapping = RECIPE_MAPPINGS[recipe as keyof typeof RECIPE_MAPPINGS];
      recipeMapping.choices.forEach(choice => {
        if (choice) {
          hardeningChoices.add(choice);
        }
      });
    }
  }
  
  return Array.from(hardeningChoices);
}

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
