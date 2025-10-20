#!/usr/bin/env node
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const [, , outputDirArg] = process.argv;
const distDir = path.resolve(process.cwd(), outputDirArg ?? 'dist');

async function readAllFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return readAllFiles(entryPath);
      }
      return path.relative(distDir, entryPath);
    }),
  );
  return files.flat();
}

function formatBytes(bytes) {
  return bytes;
}

async function main() {
  try {
    const stat = await fs.stat(distDir);
    if (!stat.isDirectory()) {
      console.error(`Expected "${distDir}" to be a directory produced by Vite build.`);
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error(`Could not read bundle directory "${distDir}":`, error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  const files = (await readAllFiles(distDir)).filter((file) => file);
  const assets = [];

  for (const relativePath of files) {
    if (!relativePath) continue;
    if (!/\.(css|js|html)$/i.test(relativePath)) {
      continue;
    }
    const absolutePath = path.join(distDir, relativePath);
    const contents = await fs.readFile(absolutePath);
    const size = formatBytes(contents.length);
    const gzipSize = formatBytes(gzipSync(contents).length);
    assets.push({
      file: relativePath.replace(/\\+/g, '/'),
      size,
      gzip: gzipSize,
      type: path.extname(relativePath).slice(1),
    });
  }

  assets.sort((a, b) => b.size - a.size);

  const totals = assets.reduce(
    (acc, asset) => {
      acc.size += asset.size;
      acc.gzip += asset.gzip;
      return acc;
    },
    { size: 0, gzip: 0 },
  );

  const report = {
    generatedAt: new Date().toISOString(),
    distDir: path.relative(process.cwd(), distDir) || '.',
    totals,
    assets,
  };

  const metricsDir = path.resolve(process.cwd(), 'metrics');
  await fs.mkdir(metricsDir, { recursive: true });
  const outputPath = path.join(metricsDir, 'bundle-report.json');
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Bundle metrics written to ${path.relative(process.cwd(), outputPath)}`);
  console.table(
    assets.slice(0, 10).map((asset) => ({
      file: asset.file,
      size: `${(asset.size / 1024).toFixed(2)} kB`,
      gzip: `${(asset.gzip / 1024).toFixed(2)} kB`,
    })),
  );
}

await main();
