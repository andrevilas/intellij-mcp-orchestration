#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..');
const metricsDir = path.resolve(appRoot, 'metrics');
const docsTarget = path.resolve(repoRoot, 'docs', 'evidence', 'TASK-UI-OBS-082');

const artifacts = [
  { source: path.join(metricsDir, 'bundle-report.json'), targetName: 'bundle-report.json' },
  { source: path.join(metricsDir, 'bundle-visualizer.html'), targetName: 'bundle-visualizer.html' },
];

async function ensureFile(pathname) {
  try {
    await fs.access(pathname);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Artefato esperado não encontrado em "${pathname}": ${message}`);
  }
}

async function main() {
  await fs.mkdir(docsTarget, { recursive: true });

  for (const artifact of artifacts) {
    await ensureFile(artifact.source);
    const targetPath = path.join(docsTarget, artifact.targetName);
    await fs.copyFile(artifact.source, targetPath);
  }

  console.log(`Artefatos de performance publicados em ${path.relative(repoRoot, docsTarget)}`);
}

main().catch((error) => {
  console.error('[performance-artifacts] Falha ao publicar métricas:', error);
  process.exit(1);
});
