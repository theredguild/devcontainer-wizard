import { spawn } from 'node:child_process'


export async function devcontainerUp(devcontainerConfig: string) {
  
  const { containerId } = await new Promise<{ containerId: string; }>((resolve, reject) => {
    const child = spawn(
      'npx',
      ['@devcontainers/cli', 'up', '--config', devcontainerConfig, '--workspace-folder', '.']
    );

    let output = '';
    let errorOutput = '';

    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });


    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`'devcontainer up' exited with code ${code}:\n${errorOutput}`));
      }

      try {
        const jsonMatch = output.match(/({[\s\S]*})/);
        if (!jsonMatch) {
            return reject(new Error('Could not find JSON output from devcontainer CLI.'));
        }
        
        const result = JSON.parse(jsonMatch[1]);

        if (result.outcome !== 'success' || !result.containerId) {
          return reject(new Error(`Dev container setup failed or did not return expected info. Output:\n${output}`));
        }
        
        resolve({
            containerId: result.containerId,
        });

      } catch (e) {
        reject(new Error(`Failed to parse JSON from devcontainer CLI output: ${e}\nOutput was:\n${output}`));
      }
    });
  });

  return containerId;
}