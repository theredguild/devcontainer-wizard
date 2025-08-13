import * as fs from 'fs/promises';
import * as path from 'path';
import { confirm } from '@inquirer/prompts';
import { openIn } from '@/shared/openIn';
import { devcontainerUp } from '@/shared/devcontainerUp';
import { INSTALL_COMMANDS, ToolKey } from '@/scripts/install_commands';
import { WizardState } from "@/types";

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

  console.log('🚀 Starting development environment generation...');
  
  // --- Derive output directory and name ---
  const savePath = config.savePath || '.';
  const projectName = config.name || 'Web3 Dev Environment';
  const safeFolderName = projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'default';
  
  console.log(`📁 Project: ${projectName}`);
  console.log(`💾 Save path: ${savePath}`);
  console.log(`📂 Folder name: ${safeFolderName}`);

  // --- Generate Dockerfile ---
  console.log('🐳 Generating Dockerfile...');
  
  const requiredDeps = new Set<ToolKey>();
  
  if (config.languages?.includes('solidity')) {
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
      // Add dependencies for specific tools
      if (['echidna', 'medusa'].includes(tool)) {
        requiredDeps.add('rust');
      }
      if (['halmos', 'slither'].includes(tool)) {
        requiredDeps.add('python');
      }
    }
  });
  

  config.securityTooling?.forEach(tool => {
    if (tool in INSTALL_COMMANDS) {
      requiredDeps.add(tool as ToolKey);
      // Most security tools require Python
      if (['slither', 'mythril', 'crytic-compile', 'panoramix', 'slither-lsp', 'napalm-toolbox', 'semgrep', 'slitherin'].includes(tool)) {
        requiredDeps.add('python');
      }
      if (tool === 'heimdall') {
        requiredDeps.add('rust');
      }
    }
  });
  
  // Validation
  if (requiredDeps.size === 0) {
    console.log('⚠️  No tools selected - creating minimal environment');
  }
  
  console.log(`🔧 Installing ${requiredDeps.size} tools: ${Array.from(requiredDeps).join(', ')}`);
  console.log(`👤 User creation: Creating user BEFORE switching to USER directive to prevent permission issues`);

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
    "# Base image: Ubuntu 24.04 ",
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
      "# Configure pip to allow system packages in container environment",
      "ENV PIP_BREAK_SYSTEM_PACKAGES=1",
      "# Install uv package manager",
      "RUN python3 -m pip install --no-cache-dir --upgrade uv"
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
      dockerfileContent.push(`# Install ${dep}`);
      dockerfileContent.push(INSTALL_COMMANDS[dep]);
      dockerfileContent.push("");
    }
  }
  const alreadyInstalledTools = [...coreRuntimeOrder, 'python']; // Skip already installed tools
  
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
    console.log(`✅ Dockerfile generated at: ${dockerfilePath}`);
  } catch (error) {
    throw new Error(`Failed to write Dockerfile: ${error}`);
  }
  
  // --- Generate devcontainer.json ---
  console.log('📋 Generating devcontainer.json...');
  
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
    
    // Disables mounting the host workspace into the container.
    "workspaceMount": "type=tmpfs,destination=/workspace",
    
    // Lifecycle commands
    initializeCommand: `echo 'Initializing ${projectName} dev container...'`,
    postCreateCommand: "echo '🎉 Dev container created successfully!'",
    postStartCommand: "echo '🚀 Dev container is ready for Web3 development!'",
    
    // Workspace configuration
    workspaceFolder: "/workspace"
  };
  
  // Apply system hardening options
  if (config.systemHardening?.includes('readonly-fs')) {
    devcontainerConfig.workspaceMount = "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached,readonly";
    console.log('🔒 Applied read-only file system hardening');
  } else {
    devcontainerConfig.workspaceMount = "source=${localWorkspaceFolder},target=/workspace,type=bind,consistency=cached";
  }
  
  // Write devcontainer.json
  const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json');
  try {
    await fs.writeFile(
      devcontainerPath,
      JSON.stringify(devcontainerConfig, null, 2)
    );
    console.log(`✅ devcontainer.json generated at: ${devcontainerPath}`);
  } catch (error) {
    throw new Error(`Failed to write devcontainer.json: ${error}`);
  }
  
  // Generate summary
  console.log('\n🎯 Generation Summary:');
  console.log(`   Project: ${projectName}`);
  console.log(`   Location: ${devcontainerDir}`);
  console.log(`   Languages: ${config.languages?.join(', ') || 'None'}`);
  console.log(`   Frameworks: ${config.frameworks?.join(', ') || 'None'}`);
  console.log(`   Security Tools: ${config.securityTooling?.join(', ') || 'None'}`);
  console.log(`   Testing Tools: ${config.fuzzingAndTesting?.join(', ') || 'None'}`);
  console.log(`   VS Code Extensions: ${config.vscodeExtensions?.length || 0} extensions`);
  if (config.systemHardening?.length) {
    console.log(`   Security Hardening: ${config.systemHardening.join(', ')}`);
  }
  if (requiredDeps.has('echidna')) {
    console.log(`   🏗️ Multi-stage build: Enabled for Echidna optimization`);
  }
  
  console.log('\n🚀 Ready to use! Run the following to start your dev container:');
  const relativeConfigPath = path.relative('.', devcontainerPath);
  const devcontainerCommand = `devcontainer up --workspace-folder . --config ${relativeConfigPath}`;
  console.log(`   ${devcontainerCommand}`);
  
  
  const shouldRun = await confirm({
    message: '🎯 Would you like to start the devcontainer now?',
    default: true
  });
  
  if (shouldRun) {
    console.log('🚀 Starting your custom devcontainer...');
    try {
      const openInSelection = await openIn();
      await devcontainerUp(relativeConfigPath, openInSelection);
      console.log('✨ Devcontainer started successfully!');
    } catch (error) {
      console.error('❌ Failed to start devcontainer:', error instanceof Error ? error.message : String(error));
      console.log('💡 You can manually start it later with:');
      console.log(`   ${devcontainerCommand}`);
    }
  } else {
    console.log('📝 You can start it later with:');
    console.log(`   ${devcontainerCommand}`);
  }
}

// Legacy function for backwards compatibility
async function generateFiles(configPath: string = 'config.json'): Promise<void> {
  return generateDevEnvironment({ configPath });
}

// Export both functions
export { generateFiles };

// Auto-run script if called directly
if (require.main === module) {
  generateFiles().catch(error => {
    console.error('❌ Generation failed:', error.message);
    process.exit(1);
  });
}