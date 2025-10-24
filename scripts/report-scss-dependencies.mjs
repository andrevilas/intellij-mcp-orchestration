#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const appSrcDir = path.join(repoRoot, 'app', 'src');

const SCSS_EXTENSIONS = ['.scss'];
const TS_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function fileExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveScssDependency(fromFile, request) {
  if (!request) {
    return null;
  }
  const fromDir = path.dirname(fromFile);
  const fullBase = request.startsWith('.') ? path.resolve(fromDir, request) : path.resolve(appSrcDir, request);
  const candidates = [];

  // direct file references
  if (path.extname(fullBase)) {
    candidates.push(fullBase);
  } else {
    candidates.push(`${fullBase}.scss`);
    candidates.push(`${fullBase}.sass`);
    candidates.push(path.join(fullBase, 'index.scss'));
    candidates.push(path.join(fullBase, '_index.scss'));
  }

  // partial variants
  const baseDir = path.dirname(fullBase);
  const baseName = path.basename(fullBase);
  if (!baseName.startsWith('_')) {
    candidates.push(path.join(baseDir, `_${baseName}.scss`));
    candidates.push(path.join(baseDir, `_${baseName}.sass`));
  }

  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) {
      return candidate;
    }
  }
  return null;
}

function parseScssDependencies(content) {
  const dependencies = new Set();
  const useRegex = /@use\s+['"]([^'"]+)['"]/g;
  const forwardRegex = /@forward\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = useRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }
  while ((match = forwardRegex.exec(content)) !== null) {
    dependencies.add(match[1]);
  }
  return Array.from(dependencies);
}

function parseScssImportsFromTs(content) {
  const imports = [];
  const importRegex = /import\s+[^;]*['"]([^'"]+\.scss)['"];?/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

function isBarrelModule(content) {
  const withoutComments = content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutImports = withoutComments.replace(/import\s+[^;]+;?/g, '');
  const body = withoutImports.trim();
  if (!body) {
    return true;
  }
  const statements = body
    .split(/;\s*/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    return true;
  }
  return statements.every((statement) => statement.startsWith('export'));
}

async function main() {
  const files = await listFiles(appSrcDir);
  const scssGraph = new Map();
  const scssConsumers = new Map();
  const barrelModules = new Map();

  const fileCache = new Map();

  async function readFileCached(file) {
    if (!fileCache.has(file)) {
      fileCache.set(file, await fs.readFile(file, 'utf8'));
    }
    return fileCache.get(file);
  }

  for (const file of files) {
    if (SCSS_EXTENSIONS.includes(path.extname(file))) {
      const content = await readFileCached(file);
      const dependencyRequests = parseScssDependencies(content);
      const resolvedDependencies = [];
      for (const request of dependencyRequests) {
        const resolved = await resolveScssDependency(file, request);
        if (resolved) {
          resolvedDependencies.push(toPosix(path.relative(repoRoot, resolved)));
        }
      }
      scssGraph.set(toPosix(path.relative(repoRoot, file)), resolvedDependencies.sort());
    } else if (TS_EXTENSIONS.includes(path.extname(file))) {
      const content = await readFileCached(file);
      const scssImports = parseScssImportsFromTs(content);
      const isBarrel = isBarrelModule(content);
      if (isBarrel) {
        barrelModules.set(file, true);
      }
      for (const request of scssImports) {
        const resolved = await resolveScssDependency(file, request);
        if (!resolved) {
          continue;
        }
        const scssPath = toPosix(path.relative(repoRoot, resolved));
        const tsPath = toPosix(path.relative(repoRoot, file));
        if (!scssConsumers.has(scssPath)) {
          scssConsumers.set(scssPath, new Set());
        }
        scssConsumers.get(scssPath).add(tsPath);
      }
    }
  }

  const redundant = [];
  for (const [scssPath, consumersSet] of scssConsumers.entries()) {
    const consumers = Array.from(consumersSet).sort();
    const barrelConsumers = consumers.filter((consumer) => barrelModules.has(path.resolve(repoRoot, consumer)));
    const directConsumers = consumers.filter((consumer) => !barrelModules.has(path.resolve(repoRoot, consumer)));
    if (barrelConsumers.length > 0 && directConsumers.length > 0) {
      redundant.push({
        scss: scssPath,
        barrelConsumers,
        directConsumers,
      });
    }
  }

  const report = {
    entry: 'app/src/styles/index.scss',
    scssGraph: Object.fromEntries(Array.from(scssGraph.entries()).sort()),
    scssConsumers: Object.fromEntries(
      Array.from(scssConsumers.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([scssPath, consumersSet]) => [scssPath, Array.from(consumersSet).sort()]),
    ),
    redundant,
  };

  const outputPath = path.join(repoRoot, 'app', 'metrics', 'scss-dependency-report.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(`SCSS dependency report written to ${toPosix(path.relative(repoRoot, outputPath))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
