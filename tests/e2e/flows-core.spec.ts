import { expect, test, loadBackendFixture } from './fixtures';

type FlowVersionFixture = {
  flow_id: string;
  versions: Array<Record<string, any>>;
};

test.describe('Flows - editor LangGraph governado por fixtures', () => {
  let fixture: FlowVersionFixture;
  let versions: Array<Record<string, any>>;
  let failNextCompare: boolean;
  let failNextRollback: boolean;

  function clone<T>(value: T): T {
    if (typeof globalThis.structuredClone === 'function') {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function computeNextVersion(): number {
    return versions.reduce((max, item) => Math.max(max, Number(item.version ?? 0)), 0) + 1;
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        if ('serviceWorker' in navigator) {
          const sw = navigator.serviceWorker;
          const noopRegistration: Partial<ServiceWorkerRegistration> = {
            scope: window.location.origin,
            update: async () => undefined,
            unregister: async () => true,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          };
          const stub = noopRegistration as ServiceWorkerRegistration;
          sw.register = () => Promise.resolve(stub);
        }
        (globalThis as { __CONSOLE_MCP_FIXTURES__?: string }).__CONSOLE_MCP_FIXTURES__ = 'ready';
      } catch (error) {
        console.warn('Não foi possível substituir navigator.serviceWorker.register', error);
      }
    });

    fixture = await loadBackendFixture<FlowVersionFixture>('flow_versions.json');
    versions = fixture.versions.map((record) => ({ ...record, graph: clone(record.graph) }));
    failNextCompare = false;
    failNextRollback = false;

    await page.route('**/api/v1/flows/*/versions**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const flowId = decodeURIComponent(segments[segments.length - 2] ?? '');

      if (flowId !== fixture.flow_id) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Flow not found in fixtures.' }),
        });
      }

      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ flow_id: fixture.flow_id, versions }),
        });
      }

      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { comment?: string | null; author?: string | null; graph?: Record<string, any> };
        const newVersionNumber = computeNextVersion();
        const graph = body?.graph ?? clone(versions[0].graph);
        const hitlNodes = Array.isArray(graph?.nodes)
          ? graph.nodes
              .filter((node: any) => node?.type === 'checkpoint')
              .map((node: any) => String(node?.id ?? 'checkpoint'))
          : [];

        const record = {
          flow_id: fixture.flow_id,
          version: newVersionNumber,
          created_at: new Date('2025-03-07T18:45:00Z').toISOString(),
          created_by: body?.author ?? null,
          comment: body?.comment ?? null,
          graph,
          agent_code: "print('Fixture flow version')",
          hitl_checkpoints: hitlNodes,
          diff: '--- fixture\n+++ fixture\n+Nova versão criada via testes.',
        };

        versions = [record, ...versions];

        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(record),
        });
      }

      return route.fulfill({
        status: 405,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Method not supported in test' }),
      });
    });

    await page.route('**/api/v1/flows/*/versions/compare**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const flowId = decodeURIComponent(segments[segments.length - 3] ?? '');

      if (flowId !== fixture.flow_id) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Flow diff not found.' }) });
      }

      if (failNextCompare) {
        failNextCompare = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Falha ao calcular diff nas fixtures.' }),
        });
      }

      const fromVersion = Number(url.searchParams.get('from_version') ?? 0);
      const toVersion = Number(url.searchParams.get('to_version') ?? 0);

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          flow_id: fixture.flow_id,
          from_version: fromVersion,
          to_version: toVersion,
          diff: `diff -- fixture v${fromVersion}..v${toVersion}`,
        }),
      });
    });

    await page.route('**/api/v1/flows/*/versions/*/rollback', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const flowId = decodeURIComponent(segments[segments.length - 4] ?? '');
      const baseVersion = Number(segments[segments.length - 2] ?? '0');

      if (flowId !== fixture.flow_id) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Rollback não suportado.' }) });
      }

      if (failNextRollback) {
        failNextRollback = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Rollback bloqueado pelas fixtures.' }),
        });
      }

      const original = versions.find((item) => Number(item.version) === baseVersion) ?? versions[versions.length - 1];
      const body = request.postDataJSON() as { author?: string | null; comment?: string | null };
      const nextVersionNumber = computeNextVersion();
      const record = {
        ...clone(original),
        version: nextVersionNumber,
        created_at: new Date('2025-03-07T19:10:00Z').toISOString(),
        created_by: body?.author ?? original.created_by ?? null,
        comment: body?.comment ?? original.comment ?? `Rollback para v${baseVersion}`,
        diff: original.diff ?? 'Rollback executado.',
      };

      versions = [record, ...versions];

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(record),
      });
    });
  });

  test('cria nova versão, compara e executa rollback com sucesso', async ({ page }) => {
    const baseNextVersion = computeNextVersion();
    const expectedRollbackVersion = baseNextVersion + 1;

    await page.goto('/');
    await page.getByRole('link', { name: 'Flows' }).click();

    await expect(page.getByRole('heading', { name: 'Orquestrador de Fluxos LangGraph' })).toBeVisible();
    await expect(page.locator('.flows-history__item')).toHaveCount(versions.length);

    await page.getByLabel('Autor').fill('Lia Observability');
    await page.getByLabel('Comentário').fill('Gerar versão de testes e2e');

    await Promise.all([
      page.waitForRequest((request) =>
        request.url().includes(`/api/v1/flows/${fixture.flow_id}/versions`) && request.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Salvar versão' }).click(),
    ]);

    await expect(page.locator('.flows-history__item')).toHaveCount(versions.length);
    await expect(page.locator('.flows-history__item').first()).toContainText(`v${baseNextVersion}`);

    await page.locator('.flows-history__item').filter({ hasText: `v${baseNextVersion - 1}` }).getByRole('button', { name: 'Comparar' }).click();
    await expect(page.locator('.flows-diff')).toContainText(`diff -- fixture v${baseNextVersion - 1}..v${baseNextVersion}`);

  await Promise.all([
      page.waitForRequest((request) =>
        request
          .url()
          .includes(`/api/v1/flows/${fixture.flow_id}/versions/${baseNextVersion - 2}/rollback`) &&
        request.method() === 'POST',
      ),
      page.locator('.flows-history__item').filter({ hasText: `v${baseNextVersion - 2}` }).getByRole('button', { name: 'Rollback' }).click(),
    ]);

    await expect(page.locator('.flows-history__item').first()).toContainText(`v${expectedRollbackVersion}`);
    await expect(page.locator('.flows-feedback__success')).toContainText('Fluxo demo-flow carregado');
    await expect(page.locator('.flows-history__header')).toContainText(`${versions.length} versões registradas`);
  });

  test('exibe mensagens de erro quando diff ou rollback falham', async ({ page }) => {
    failNextCompare = true;
    failNextRollback = true;

    await page.goto('/');
    await page.getByRole('link', { name: 'Flows' }).click();

    await page.locator('.flows-history__item').filter({ hasText: 'v2' }).getByRole('button', { name: 'Comparar' }).click();
    await expect(page.locator('.flows-feedback__error')).toContainText('Falha ao calcular diff nas fixtures.');

    await Promise.all([
      page.waitForRequest((request) =>
        request
          .url()
          .includes(`/api/v1/flows/${fixture.flow_id}/versions/2/rollback`) &&
        request.method() === 'POST',
      ),
      page.locator('.flows-history__item').filter({ hasText: 'v2' }).getByRole('button', { name: 'Rollback' }).click(),
    ]);
    await expect(page.locator('.flows-feedback__error')).toContainText('Rollback bloqueado pelas fixtures.');
  });
});
