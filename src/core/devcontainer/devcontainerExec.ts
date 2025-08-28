import { spawn } from 'node:child_process'

export async function devcontainerExec(containerId: string, openIn: string) {
  if (openIn === 'shell') {
    await new Promise<void>((resolve, reject) => {
      const exec = spawn(
        'npx',
        [
          '@devcontainers/cli',
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
  } else if (openIn === 'cursor') {
    await new Promise<void>((resolve, reject) => {
      const exec = spawn(
        'cursor',
        [
          '.',
        ],
        { stdio: 'inherit' }
      );
    });
  }
}
