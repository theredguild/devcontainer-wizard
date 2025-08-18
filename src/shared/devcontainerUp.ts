import { spawn } from 'node:child_process'


export async function devcontainerUp(devcontainerConfig: string, openIn: string) {
  
  const { containerId } = await new Promise<{ containerId: string; }>((resolve, reject) => {
    const child = spawn(
      'devcontainer',
          // Using --id-label to ensure we can find the container later if needed.
          // The command will output a JSON object with details upon completion.
      ['up', '--config', devcontainerConfig, '--workspace-folder', '.']
    );

    let output = '';
    let errorOutput = '';

    
    child.stdout.on('data', (data) => {
      
      process.stdout.write(data);
      output += data.toString();
    });

    
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
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

  if (openIn === 'shell') {
    await new Promise<void>((resolve, reject) => {
      const exec = spawn(
        'devcontainer',
        [
          'exec',
          '--container-id',
          containerId,
          'bash',
          '-lc',
          'cd /workspace && exec bash -l'
        ],
        { stdio: 'inherit' }
      );

      exec.on('error', (err) => {
        reject(err);
      });

      exec.on('close', (code) => {
        if (code !== 0) {
          console.warn(`Shell session exited with code ${code}.`);
        }
        resolve();
      });
    }); 
  } else if (openIn === 'code') {
      await new Promise<void>((resolve, reject) => {
      const exec = spawn(
        'code',
        [
          '.',
        ],
        { stdio: 'inherit' }
      );

      exec.on('error', (err) => {
        reject(err);
      });

      exec.on('close', (code) => {
        if (code !== 0) {
          console.warn(`VS Code session exited with code ${code}.`);
        }
        resolve();
      });
    }); 
  }
}
