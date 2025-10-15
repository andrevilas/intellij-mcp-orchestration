import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(currentDir, '..', '..');
const appDist = join(rootDir, 'app', 'dist');
const targetDir = join(rootDir, 'desktop', 'resources', 'frontend');

async function ensureFrontendBuild() {
  try {
    const info = await stat(appDist);
    if (!info.isDirectory()) {
      throw new Error('app/dist is not a directory');
    }
  } catch (err) {
    throw new Error('frontend build not found. Run "pnpm --dir app build" first.');
  }
}

async function copyFrontend() {
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(appDist, targetDir, { recursive: true });
}

await ensureFrontendBuild();
await copyFrontend();
console.log(`[prepare-frontend] Copied ${appDist} -> ${targetDir}`);
