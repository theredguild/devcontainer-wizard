import { checkboxWithTopDescription, selectWithTopDescription } from "@/ui/components/";
import { ui } from "@/ui/styling/ui";

export async function systemHardening(state: {systemHardening?: string[]}) {
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  const selectedOptions: string[] = [];

  // File System Security
  const fsOptions = await checkboxWithTopDescription({
    message: "File System Security",
    loop: false,
    choices: [
      { name: "(EXPERIMENTAL) Read-only file system", value: "readonly-os", description: "Mounts the file system as read-only, some tools will not work" },
      { name: "Secure temp directories", value: "secure-tmp", description: "Creates temp dirs with noexec, nosuid flags" },
      { name: "Ephemeral workspace", value: "ephemeral-workspace", description: "Uses tmpf mount to create a ephemeral workpsace"}
    ],
    default: state.systemHardening,
    footer: {
      back: false,
      exit: true,
    },
  });
  selectedOptions.push(...fsOptions);

  ui.clearScreen();
  console.log(ui.header());
  console.log('');

 
  const containerSecurity = await checkboxWithTopDescription({
    message: "Container Security",
    loop: false,
    choices: [
      { name: "Drop all capabilities", value: "drop-caps", description: "Removes all Linux capabilities from container" },
      { name: "No new privileges", value: "no-new-privs", description: "Prevents privilege escalation through SUID/SGID" },
      { name: "AppArmor profile", value: "apparmor", description: "Applies Docker's default AppArmor MAC profile" },
    ],
    footer: {
      exit: true,
    },
  });
  selectedOptions.push(...containerSecurity);

  ui.clearScreen();
  console.log(ui.header());
  console.log('');

  const networkIsolation = await selectWithTopDescription({
    message: "Network Configuration",
    loop: false,
    choices: [
      { name: "Normal networking", value: "normal", description: "Standard container networking" },
      { name: "Enhanced DNS security", value: "secure-dns", description: "Forces Cloudflare DNS (1.1.1.1, 1.0.0.1)" },
      { name: "Complete network isolation", value: "network-none", description: "Completely isolates container from network (conflicts with DNS options), VS Code extensions will not be installed" },
    ],
    footer: {
      exit: true,
    },
  });

  if (networkIsolation === "secure-dns") {
    ui.clearScreen();
    console.log(ui.header());
    console.log('');
    selectedOptions.push("secure-dns");
    
    // Additional network security options
    const additionalNetworkSecurity = await checkboxWithTopDescription({
      message: "Additional Network Security (compatible with DNS)",
      loop: false,
      choices: [
        { name: "Disable IPv6", value: "disable-ipv6", description: "Disables IPv6 networking to reduce attack surface" },
        { name: "Disable raw packets", value: "no-raw-packets", description: "Drops NET_RAW capability to prevent packet crafting" },
      ],
    });
    selectedOptions.push(...additionalNetworkSecurity);
  } else if (networkIsolation === "network-none") {
    selectedOptions.push("network-none");
  }

  ui.clearScreen();
  console.log(ui.header());
  console.log('');

  // Application Security
  const appSecurity = await checkboxWithTopDescription    ({
    message: "Application Security",
    loop: false,
    choices: [
      { name: "VS Code security", value: "vscode-security", description: "Disables auto-tasks, workspace trust, and telemetry" },
    ],
    footer: {
      back: false,
      exit: true,
    },
  });
  selectedOptions.push(...appSecurity);

  ui.clearScreen();
  console.log(ui.header());
  console.log('');

  // Resource Limits
  const resourceLimits = await selectWithTopDescription({
    message: "Resource Limits",
    loop: false,
    choices: [
      { name: "No limits", value: "none", description: "No resource constraints" },
      { name: "Light (512MB, 2 cores)", value: "resource-limits", description: "Suitable for simple development" },
      { name: "Medium (2GB, 4 cores)", value: "resource-limits-medium", description: "Better for Node.js, Rust, Java projects" },
      { name: "Heavy (4GB, 8 cores)", value: "resource-limits-heavy", description: "For ML, large builds, or complex projects" },
    ],
    footer: {
      back: false,
      exit: true,
    },
  });
  if (resourceLimits !== "none") {
    selectedOptions.push(resourceLimits);
  }

  return selectedOptions;
}
