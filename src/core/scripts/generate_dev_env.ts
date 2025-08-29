import * as fs from 'fs/promises';
import * as path from 'path';
import { INSTALL_COMMANDS, ToolKey } from '@/core/scripts/install_commands';
import { WizardState } from "@/types";
import { colorize, symbols } from '@/ui/components';
import { ui } from '@/ui/styling/ui';
import { shouldRun } from '@/utils/shouldRun';

interface GenerationOptions {
  configPath?: string;
  config?: WizardState;
}

export async function generateDevEnvironment(options: GenerationOptions = {}): Promise<void> {
  const { configPath = 'config.json', config: providedConfig } = options;
  
  let config: WizardState;
  
  if (providedConfig) {
    config = providedConfig;
  } else {
    try {
      const configFileContent = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(configFileContent) as WizardState;
    } catch (error) {
      throw new Error(`Failed to read configuration file: ${configPath}. ${error}`);
    }
  }

  ui.clearScreen()
  console.log(colorize.brand(symbols.arrow + ' Starting development environment generation...'));
  
    const savePath = config.savePath || '.';
  const projectName = config.name || 'Web3 Dev Environment';
  const safeFolderName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'default';
  
  console.log(colorize.brand(symbols.bullet + ' Project: ' + projectName));
  console.log(colorize.brand(symbols.bullet + ' Save path: ' + savePath));
  console.log(colorize.brand(symbols.bullet + ' Folder name: ' + safeFolderName));

    console.log(colorize.brand(symbols.diamond + ' Generating Dockerfile...'));
  
  const requiredDeps = new Set<ToolKey>();
  
  if (config.languages?.includes('solidity')) {
    requiredDeps.add('python');
    requiredDeps.add('solc-select');
  }
  if (config.languages?.includes('vyper')) {
    requiredDeps.add('python');
    requiredDeps.add('vyper');
  }
  
  config.frameworks?.forEach(framework => {
    if (framework === 'foundry') {
      requiredDeps.add('rust');
      requiredDeps.add('foundry');
    } else if (framework === 'hardhat') {
      requiredDeps.add('node');
      requiredDeps.add('hardhat');
    } else if (framework === 'ape') {
      requiredDeps.add('python');
      requiredDeps.add('ape');
    }
  });
  
  config.fuzzingAndTesting?.forEach(tool => {
    if (tool in INSTALL_COMMANDS) {
      requiredDeps.add(tool as ToolKey);
      if (['echidna', 'medusa'].includes(tool)) {
        requiredDeps.add('go');
      }
      if (tool === 'ityfuzz' || tool === 'aderyn') {
        requiredDeps.add('rust');
      }
      if (tool === 'halmos') {
        requiredDeps.add('python');
      }
    }
  });
  
  config.securityTooling?.forEach(tool => {
    if (tool in INSTALL_COMMANDS) {
      requiredDeps.add(tool as ToolKey);
      if (['slither', 'mythril', 'crytic-compile', 'panoramix', 'slither-lsp', 'napalm-toolbox', 'semgrep', 'slitherin'].includes(tool)) {
        requiredDeps.add('python');
      }
      if (tool === 'heimdall') {
        requiredDeps.add('rust');
      }
      if (tool === 'panoramix') {
        requiredDeps.add('tintinweb.vscode-decompiler');
      }
    }
  });
  
  if (requiredDeps.size === 0) {
    console.log(colorize.warning(symbols.triangle + ' No tools selected - creating minimal environment'));
  }
  
  console.log(colorize.brand(symbols.diamond + ' Installing ' + requiredDeps.size + ' tools: ' + Array.from(requiredDeps).join(', ')));

  const dockerfileContent: string[] = [];

  dockerfileContent.push(
    "# syntax=docker/dockerfile:1.8",
    "# check=error=true"
  )



  if (requiredDeps.has('echidna')) {
    dockerfileContent.push(
        "# Multi-stage build for Echidna",
        "# Echidna stage",
        "FROM --platform=linux/amd64 ghcr.io/crytic/echidna/echidna:latest AS echidna",
        ""
      );
  }
  
  dockerfileContent.push(
    "# Base image: Debian 12",
    "FROM mcr.microsoft.com/vscode/devcontainers/base:bookworm",
    ""
  );

  dockerfileContent.push(
    "RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash-completion \
      build-essential \
      curl \
      git \
      jq \
      pkg-config \
      sudo \
      unzip \
      vim \
      wget \
      zsh \
      && rm -rf /var/lib/apt/lists/*"
  )

  if (requiredDeps.has('python')) {
    dockerfileContent.push(
      "# Install Python dependencies",
      "RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      python3-pip \
      libpython3-dev \
      python3-dev \
      python3-venv \
      && rm -rf /var/lib/apt/lists/*"
    )
  }

  dockerfileContent.push(
    "# Switch to vscode (drop privs)",
    "USER vscode",
    "WORKDIR /home/vscode",
    "ENV HOME=/home/vscode",
    "# Update PATH",
    "ENV USR_LOCAL_BIN=/usr/local/bin",
    "ENV LOCAL_BIN=${HOME}/.local/bin",
    "ENV PNPM_HOME=${HOME}/.local/share/pnpm",
    "ENV PATH=${PATH}:${USR_LOCAL_BIN}:${LOCAL_BIN}:${PNPM_HOME}"
  )

  if (requiredDeps.has('python')) {
    dockerfileContent.push(
      `# Install uv
      RUN curl -LsSf https://astral.sh/uv/install.sh | sh
      # Update PATH environment
      ENV UV_LOCAL_BIN=$HOME/.cargo/bin`,
      "ENV PATH=${PATH}:${USR_LOCAL_BIN}:${LOCAL_BIN}:${PNPM_HOME}:${UV_LOCAL_BIN}",
      `# Install Python 3.12 with uv
      RUN uv python install 3.12`
    )
  }
  
  dockerfileContent.push(
    "# Set the default shell execution for subsequent RUN commands",
    "ENV SHELL=/usr/bin/zsh",
    `SHELL ["/bin/zsh", "-ic"]`
  )

  // Install core runtime dependencies first
  const coreRuntimeOrder: ToolKey[] = ['rust', 'go', 'node'];
  
  for (const dep of coreRuntimeOrder) {
    if (requiredDeps.has(dep)) {
      dockerfileContent.push(INSTALL_COMMANDS[dep]);
      dockerfileContent.push("");
    }
  }
  const alreadyInstalledTools = [...coreRuntimeOrder, 'python'];
  
  for (const tool of Array.from(requiredDeps)) {
    if (!alreadyInstalledTools.includes(tool)) {
      dockerfileContent.push(`# Install ${tool}`);
      dockerfileContent.push(INSTALL_COMMANDS[tool]);
      dockerfileContent.push("");
    }
  }

  if (requiredDeps.has('echidna')) {
      dockerfileContent.push(
        "USER root",
        "# Copy Echidna binary from echidna stage",
        "COPY --from=echidna /usr/local/bin/echidna /usr/local/bin/echidna",
        "RUN chmod 755 /usr/local/bin/echidna",
        "USER vscode"
      );
    }

  dockerfileContent.push(
    "# Final setup",
    
    "RUN echo 'Development environment ready!' && \\",
    "echo 'Tools installed:' && \\",
    "    ls -la $HOME/.local/bin/ || true",
    "",
    "WORKDIR /workspace"
  );

  // Load selectedHardening
  const selectedHardening = new Set(config.systemHardening || []);

  // Git clone
  if (config.gitRepository?.enabled && config.gitRepository.url) {
      
      const branchFlag = config.gitRepository.branch ? `--branch ${config.gitRepository.branch} ` : '';
      
      dockerfileContent.push(
       `# Clone git repo
        RUN mkdir -p /home/vscode/repos \
        && git clone https://github.com/theredguild/devcontainer /home/vscode/repos/project \
        && chown -R vscode:vscode /home/vscode/repos`
      );
  }

  // Create output directory
  const devcontainerDir = path.join(savePath, '.devcontainer', safeFolderName);
  try {
    await fs.mkdir(devcontainerDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${devcontainerDir}: ${error}`);
  }
  
  // Write Dockerfile
  const dockerfilePath = path.join(devcontainerDir, 'Dockerfile');
  try {
    await fs.writeFile(dockerfilePath, dockerfileContent.join('\n'));
    console.log(colorize.success(symbols.check + ' Dockerfile generated at: ' + dockerfilePath));
  } catch (error) {
    throw new Error(`Failed to write Dockerfile: ${error}`);
  }
  
  // --- Generate devcontainer.json ---
  ui.clearScreen()
  console.log(colorize.brand(symbols.bullet + ' Generating devcontainer.json...'));
  
  const devcontainerConfig: any = {
    name: projectName,
    build: {
      dockerfile: "Dockerfile",
    },
    remoteUser: "vscode",
    
    // Features for enhanced functionality
    features: {
      "ghcr.io/devcontainers/features/git:1": {},
      "ghcr.io/devcontainers/features/github-cli:1": {}
    },
    
    // Container environment
    containerEnv: {
      "SHELL": "/bin/zsh",
      "DEVCONTAINER_ID_LABEL": `${safeFolderName}-web3-devcontainer`
    },
    
    // VS Code customizations
    customizations: {
      vscode: {
        extensions: config.vscodeExtensions || [],
        settings: {
          "terminal.integrated.defaultProfile.linux": "zsh",
          "terminal.integrated.profiles.linux": {
            "zsh": {
              "path": "/bin/zsh"
            }
          }
        }
      }
    },

    // Lifecycle commands
    initializeCommand: `echo 'Initializing ${projectName} dev container...'`,
    postStartCommand: "echo '🚀 Dev container is ready for Web3 development!'",
    
    // Workspace configuration
    workspaceFolder: "/workspace"
  };

  // Add Tintin's Decompiler to VS Code extensions if it's required but not already in the config
  if (requiredDeps.has('tintinweb.vscode-decompiler') && !config.vscodeExtensions?.includes('tintinweb.vscode-decompiler')) {
    devcontainerConfig.customizations.vscode.extensions.push('tintinweb.vscode-decompiler');
  }

  // Workspace mounting strategy


  if (selectedHardening.has('ephemeral-workspace')) {
    devcontainerConfig.workspaceMount = "type=tmpfs,destination=/workspace,tmpfs-mode=1777";
    console.log(colorize.brand(symbols.diamond + ' Applied ephemeral workspace (tmpfs mount)'));
  }  else {
    devcontainerConfig.workspaceMount = "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached";
  }

  if (config.gitRepository?.enabled && config.gitRepository.url) {
    devcontainerConfig.postCreateCommand = 'mkdir -p /workspace/repo && cp -r /home/vscode/repos/project/* /workspace/repo'
  }


  // Docker run arguments for hardening
  const runArgs: string[] = [];

  // Capabilities
  if (selectedHardening.has('drop-caps')) {
    runArgs.push('--cap-drop=ALL');
  } else if (selectedHardening.has('no-raw-packets')) {
    runArgs.push('--cap-drop=NET_RAW');
  }

  // Read-only

  if (selectedHardening.has('readonly-os')) {
    runArgs.push(
    "--read-only",
      // --- Writable, EXECUTABLE Mounts for VS Code Server ---
      "--tmpfs", "/home/vscode/.vscode-server:rw,exec,nosuid,size=512m,uid=1000,gid=1000",
      "--tmpfs", "/home/vscode/.vscode-server-insiders:rw,exec,nosuid,size=256m,uid=1000,gid=1000",

      // --- Writable, NON-EXECUTABLE Mounts for Caches, Configs, and Logs ---
      "--tmpfs", "/home/vscode/.cache:rw,noexec,nosuid,size=256m,uid=1000,gid=1000",
      "--tmpfs", "/home/vscode/.config:rw,noexec,nosuid,size=128m,uid=1000,gid=1000",
      "--tmpfs", "/home/vscode/.local:rw,noexec,nosuid,size=256m,uid=1000,gid=1000",
      "--tmpfs", "/home/vscode/.gnupg:rw,noexec,nosuid,size=32m,uid=1000,gid=1000",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=512m",
      "--tmpfs", "/var/tmp:rw,noexec,nosuid,size=512m",
      "--tmpfs", "/var/log:rw,noexec,nosuid,size=128m",
      "--tmpfs", "/run:rw,noexec,nosuid,size=128m",
      "--tmpfs", "/home/vscode/.devcontainer:rw,noexec,nosuid,size=32m,uid=1000,gid=1000"
    )
  }

    
  // Security options
  if (selectedHardening.has('no-new-privs')) {
    runArgs.push('--security-opt', 'no-new-privileges:true');
  }
  if (selectedHardening.has('apparmor')) {
    runArgs.push('--security-opt', 'apparmor=docker-default');
  }

  // Networking
  if (selectedHardening.has('network-none')) {
    runArgs.push('--network=none');
  } else if (selectedHardening.has('disable-ipv6')) {
    runArgs.push('--sysctl', 'net.ipv6.conf.all.disable_ipv6=1', '--sysctl', 'net.ipv6.conf.default.disable_ipv6=1');
  }
  if (selectedHardening.has('secure-dns')) {
    runArgs.push('--dns=1.1.1.1', '--dns=1.0.0.1');
  }

  // Temporary directories
  if (selectedHardening.has('secure-tmp')) {
    runArgs.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=512m', '--tmpfs', '/var/tmp:rw,noexec,nosuid,size=512m');
  }

  // Resource limits
  if (selectedHardening.has('resource-limits')) {
    runArgs.push('--memory=512m', '--cpus=2');
  } else if (selectedHardening.has('resource-limits-light')) {
    runArgs.push('--memory=512m', '--cpus=2');
  } else if (selectedHardening.has('resource-limits-standard')) {
    runArgs.push('--memory=2g', '--cpus=4');
  } else if (selectedHardening.has('resource-limits-heavy')) {
    runArgs.push('--memory=4g', '--cpus=8');
  }

  if (runArgs.length > 0) {
    devcontainerConfig.runArgs = runArgs;
  }

  // VS Code security settings
  if (selectedHardening.has('vscode-security')) {
    devcontainerConfig.customizations.vscode.settings = {
      ...devcontainerConfig.customizations.vscode.settings,
      'task.autoDetect': 'off',
      'task.allowAutomaticTasks': 'off',
      'security.workspace.trust.enabled': false,
      'telemetry.telemetryLevel': 'off',
    };
  }
  
  // Write devcontainer.json
  const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json');
  try {
    await fs.writeFile(
      devcontainerPath,
      JSON.stringify(devcontainerConfig, null, 2)
    );
    console.log(colorize.success(symbols.check + ' devcontainer.json generated at: ' + devcontainerPath));
  } catch (error) {
    throw new Error(`Failed to write devcontainer.json: ${error}`);
  }
  
  // Generate summary
  ui.clearScreen()
  console.log('\n' + colorize.brand(symbols.diamond + ' Generation Summary:'));
  console.log('   Project: ' + projectName);
  console.log('   Location: ' + devcontainerDir);
  console.log('   Languages: ' + (config.languages?.join(', ') || 'None'));
  console.log('   Frameworks: ' + (config.frameworks?.join(', ') || 'None'));
  console.log('   Security Tools: ' + (config.securityTooling?.join(', ') || 'None'));
  console.log('   Testing Tools: ' + (config.fuzzingAndTesting?.join(', ') || 'None'));
  console.log('   VS Code Extensions: ' + (config.vscodeExtensions?.length || 0) + ' extensions');
  if (config.systemHardening?.length) {
    console.log('   Security Hardening: ' + config.systemHardening.join(', '));
  }
  if (config.gitRepository?.enabled && config.gitRepository.url) {
    console.log('   Git Repository: ' + config.gitRepository.url + (config.gitRepository.branch ? ' (' + config.gitRepository.branch + ')' : ''));
  }
  
  
  await shouldRun(devcontainerPath);
}

// Legacy function for backwards compatibility
export async function generateFiles(configPath: string = 'config.json'): Promise<void> {
  return generateDevEnvironment({ configPath });
}

// Auto-run script if called directly
if (require.main === module) {
  generateFiles().catch(error => {
    console.error(colorize.error(symbols.circle + ' Generation failed: ' + error.message));
    process.exit(1);
  });
}