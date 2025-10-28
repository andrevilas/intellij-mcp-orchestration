import type { Suite, Task, TestContext } from 'vitest';

interface OpenHandleLeak {
  testId: string;
  testName: string;
  handles: string[];
}

type ProcessWithHandles = NodeJS.Process & {
  _getActiveHandles?: () => unknown[];
};

const processWithHandles = process as ProcessWithHandles;

const state = {
  baselines: new Map<string, unknown[]>(),
  leaks: [] as OpenHandleLeak[],
};

function getActiveHandles(): unknown[] {
  const handles = processWithHandles._getActiveHandles?.() ?? [];
  return Array.from(handles);
}

function describeHandle(handle: unknown): string {
  if (!handle) {
    return 'unknown-handle';
  }
  const reference = handle as { constructor?: { name?: string } };
  const constructorName = reference.constructor?.name;
  if (constructorName && constructorName !== 'Object') {
    return constructorName;
  }
  return typeof handle;
}

function buildTaskLabel(task: Task): string {
  const segments: string[] = [];
  let currentSuite: Suite | undefined | null = task.suite;
  while (currentSuite) {
    if (currentSuite.name) {
      segments.unshift(currentSuite.name);
    }
    currentSuite = currentSuite.suite;
  }
  segments.push(task.name);
  return segments.join(' > ');
}

export function beginOpenHandleSnapshot(context: TestContext): void {
  const handles = getActiveHandles();
  state.baselines.set(context.task.id, handles);
}

export function finalizeOpenHandleSnapshot(context: TestContext): void {
  const baseline = state.baselines.get(context.task.id) ?? [];
  state.baselines.delete(context.task.id);
  const active = getActiveHandles();
  const leakedHandles = active.filter((handle) => !baseline.includes(handle));
  if (leakedHandles.length === 0) {
    return;
  }
  state.leaks.push({
    testId: context.task.id,
    testName: buildTaskLabel(context.task),
    handles: leakedHandles.map(describeHandle),
  });
}

export function consumeOpenHandleLeaks(): OpenHandleLeak[] {
  const leaks = state.leaks.slice();
  state.leaks.length = 0;
  return leaks;
}
