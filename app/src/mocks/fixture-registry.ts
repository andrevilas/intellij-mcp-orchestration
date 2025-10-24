const serverFixtureModules = import.meta.glob<unknown>(
  '../../../server/routes/fixtures/*.json',
  { eager: true, import: 'default' },
);

const backendFixtureModules = import.meta.glob<unknown>(
  '../../../tests/fixtures/backend/*.json',
  { eager: true, import: 'default' },
);

type FixtureModuleMap = Record<string, unknown>;

const fixtureStore = new Map<string, unknown>();

const cloneFixture = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall back to JSON cloning below
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const extractFixtureName = (modulePath: string): string | null => {
  const normalizedPath = modulePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) {
    return null;
  }
  return lastSegment.endsWith('.json')
    ? lastSegment.slice(0, lastSegment.length - 5)
    : lastSegment;
};

const registerModules = (modules: FixtureModuleMap) => {
  for (const [modulePath, moduleValue] of Object.entries(modules)) {
    const basename = extractFixtureName(modulePath);
    if (!basename || fixtureStore.has(basename)) {
      continue;
    }
    fixtureStore.set(basename, moduleValue);
  }
};

registerModules(serverFixtureModules as FixtureModuleMap);
registerModules(backendFixtureModules as FixtureModuleMap);

export const hasFixture = (name: string): boolean => fixtureStore.has(name);

export const listFixtures = (): string[] => Array.from(fixtureStore.keys()).sort();

export function loadFixture<T = unknown>(name: string, fallback?: T): T {
  if (fixtureStore.has(name)) {
    const value = fixtureStore.get(name) as T;
    return cloneFixture(value);
  }

  if (fallback !== undefined) {
    return cloneFixture(fallback);
  }

  throw new Error(`Fixture "${name}" não encontrada nas pastas suportadas.`);
}

export function resetFixtureStore(): void {
  fixtureStore.clear();
  registerModules(serverFixtureModules as FixtureModuleMap);
  registerModules(backendFixtureModules as FixtureModuleMap);
}
