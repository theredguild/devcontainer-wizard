import { selectWithTopDescription } from "@/ui/components/selectWithTopDescription";

const RECIPE_MAPPINGS = {
  "airgapped-ephemeral-sandbox": {
    description: "Sealed box without network or persistence for maximum isolation.",
    caveat: "Extensions and package managers will not work.",
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
  },
  "hardened-online-dev": {
    description: "Day-to-day development with network access but reduced attack surface.",
    caveat: "Tools that craft packets will break due to no-raw-packets.",
    choices: [
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "no-raw-packets",
      "secure-dns",
      "vscode-security"
    ]
  },
  "source-review-only": {
    description: "For reading code and running linters without writing to the repository.",
    caveat: "Compilers and formatters that write will fail.",
    choices: [
      "readonly-os",
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
  "training-workshop-lab": {
    description: "For classroom or public workshops with predictable resource usage.",
    caveat: "Memory-hungry builds may OOM at 512 MB.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "secure-dns",
      "vscode-security"
    ]
  },
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
  "forensics-reader": {
    description: "Inspect artifacts offline without altering evidence.",
    caveat: "No network access or persistence.",
    choices: [
      "readonly-os",
      "ephemeral-workspace-nowrite",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "network-none",
      "vscode-security"
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
  "net-disabled-build-test": {
    description: "Prove builds succeed without network access.",
    caveat: "Build steps requiring downloads will fail.",
    choices: [
      "ephemeral-workspace",
      "secure-tmp",
      "drop-caps",
      "no-new-privs",
      "apparmor",
      "network-none",
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
  }
} as const;

export async function recipes(state: {recipes?: string[]}) {
  return await selectWithTopDescription({
    message: "Select one hardening recipe:",
    loop: false,
    default: state.recipes,
    choices: [
      { 
        name: "Airgapped ephemeral sandbox", 
        value: "airgapped-ephemeral-sandbox", 
        description: RECIPE_MAPPINGS["airgapped-ephemeral-sandbox"].description,
        caveat: RECIPE_MAPPINGS["airgapped-ephemeral-sandbox"].caveat
      },
      { 
        name: "Hardened online dev", 
        value: "hardened-online-dev", 
        description: RECIPE_MAPPINGS["hardened-online-dev"].description,
        caveat: RECIPE_MAPPINGS["hardened-online-dev"].caveat
      },
      { 
        name: "Source-review only", 
        value: "source-review-only", 
        description: RECIPE_MAPPINGS["source-review-only"].description,
        caveat: RECIPE_MAPPINGS["source-review-only"].caveat
      },
      { 
        name: "Training workshop lab", 
        value: "training-workshop-lab", 
        description: RECIPE_MAPPINGS["training-workshop-lab"].description,
        caveat: RECIPE_MAPPINGS["training-workshop-lab"].caveat
      },
      { 
        name: "Network restricted analysis", 
        value: "network-restricted-analysis", 
        description: RECIPE_MAPPINGS["network-restricted-analysis"].description,
        caveat: RECIPE_MAPPINGS["network-restricted-analysis"].caveat
      },
      { 
        name: "CI-like local runner", 
        value: "ci-like-local-runner", 
        description: RECIPE_MAPPINGS["ci-like-local-runner"].description,
        caveat: RECIPE_MAPPINGS["ci-like-local-runner"].caveat
      },
      { 
        name: "Forensics reader", 
        value: "forensics-reader", 
        description: RECIPE_MAPPINGS["forensics-reader"].description,
        caveat: RECIPE_MAPPINGS["forensics-reader"].caveat
      },
      { 
        name: "Package-install session", 
        value: "package-install-session", 
        description: RECIPE_MAPPINGS["package-install-session"].description,
        caveat: RECIPE_MAPPINGS["package-install-session"].caveat
      },
      { 
        name: "Net-disabled build test", 
        value: "net-disabled-build-test", 
        description: RECIPE_MAPPINGS["net-disabled-build-test"].description,
        caveat: RECIPE_MAPPINGS["net-disabled-build-test"].caveat
      },
      { 
        name: "Security research with controlled net", 
        value: "security-research-controlled-net", 
        description: RECIPE_MAPPINGS["security-research-controlled-net"].description,
        caveat: RECIPE_MAPPINGS["security-research-controlled-net"].caveat
      },   
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
