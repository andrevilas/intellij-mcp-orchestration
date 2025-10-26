#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(repoRoot, 'app');
const evidenceDir = path.resolve(repoRoot, 'docs', 'evidence', 'TASK-UI-OBS-082');

async function run(command, args, options = {}) {
  const { cwd = repoRoot, env = process.env } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Processo ${command} finalizou com código ${code ?? 'desconhecido'}`));
      }
    });

    child.on('error', (error) => reject(error));
  });
}

async function copyArtifacts() {
  const metricsDir = path.resolve(appRoot, 'metrics');
  const artifacts = [
    { source: path.join(metricsDir, 'bundle-report.json'), target: path.join(evidenceDir, 'bundle-report.json') },
    { source: path.join(metricsDir, 'bundle-visualizer.html'), target: path.join(evidenceDir, 'bundle-visualizer.html') },
  ];

  await fs.mkdir(evidenceDir, { recursive: true });

  for (const artifact of artifacts) {
    await fs.copyFile(artifact.source, artifact.target);
  }
}

async function main() {
  await run('pnpm', ['--dir', appRoot, 'run', 'build:bundle-report'], {
    env: {
      ...process.env,
      SKIP_TYPECHECK: '1',
    },
  });
  await copyArtifacts();
  await run('pnpm', ['--dir', appRoot, 'run', 'lighthouse:ci'], {
    env: {
      ...process.env,
      LHCI_SKIP_BUILD: 'true',
    },
  });
}

main().catch((error) => {
  console.error('[evidence] Falha ao atualizar evidências UI OBS 082:', error);
  process.exit(1);
});
