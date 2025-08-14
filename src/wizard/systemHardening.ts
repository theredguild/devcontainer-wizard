import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function systemHardening() {
  return await checkbox({
    message: "Select system hardening options",
    theme: checkboxStyle,
    choices: [
      { name: "Read-only file system", value: "readonly-fs", description: "Mounts the file system as read-only" },
      { name: "Workspace isolation", value: "workspace-isolation", description: "Uses tmpfs mount to isolate workspace from host" },
      { name: "Workspace isolation (without writing access)", value: "workspace-isolation-nowrite", description: "Uses tmpfs mount to isolate workspace from host (no writing access)" },
      { name: "Secure temp directories", value: "secure-tmp", description: "Creates temp dirs with noexec, nosuid flags" },
      { name: "Drop all capabilities", value: "drop-caps", description: "Removes all Linux capabilities from container" },
      { name: "No new privileges", value: "no-new-privs", description: "Prevents privilege escalation through SUID/SGID" },
      { name: "AppArmor profile", value: "apparmor", description: "Applies Docker's default AppArmor MAC profile" },
      { name: "Disable IPv6", value: "disable-ipv6", description: "Disables IPv6 networking to reduce attack surface" },
      { name: "Cloudflare DNS", value: "secure-dns", description: "Forces Cloudflare DNS (1.1.1.1, 1.0.0.1)" },
      { name: "Disable raw packets", value: "no-raw-packets", description: "Drops NET_RAW capability to prevent packet crafting" },
      { name: "VS Code security", value: "vscode-security", description: "Disables auto-tasks, workspace trust, and telemetry" },
      { name: "Network isolation", value: "network-none", description: "Completely isolates container from network" },
      { name: "Resource limits", value: "resource-limits", description: "Sets memory (512MB) and CPU (2 cores) limits" },
      { name: "Seccomp filtering", value: "seccomp", description: "Applies default seccomp security profile" },
    ],
  });
}
