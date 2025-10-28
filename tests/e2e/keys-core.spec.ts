import { expect, test, loadBackendFixture } from './fixtures';

type ProvidersFixture = { providers: Array<Record<string, unknown>> };

type KeysFixture = {
  secrets: Array<{ provider_id: string; has_secret: boolean; updated_at: string | null }>;
  values: Record<string, { provider_id: string; value: string; updated_at: string }>;
  tests: Record<string, { provider_id: string; status: string; latency_ms: number; tested_at: string; message: string }>;
};

test.describe('Gestão de chaves MCP', () => {
  let providersFixture: ProvidersFixture;
  let keysFixture: KeysFixture;
  let failDeleteOnce: boolean;
  let failCodexTestOnce: boolean;

  test.beforeEach(async ({ page }) => {
    providersFixture = await loadBackendFixture<ProvidersFixture>('providers.json');
    keysFixture = await loadBackendFixture<KeysFixture>('keys_fixtures.json');
    failDeleteOnce = true;
    failCodexTestOnce = true;

    await page.route('**/api/v1/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(providersFixture),
      }),
    );

    await page.route('**/api/v1/secrets', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ secrets: keysFixture.secrets }),
      }),
    );

    await page.route('**/api/v1/secrets/*/test', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') {
        return route.fallback();
      }

      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const providerId = decodeURIComponent(segments[segments.length - 2] ?? '');

      if (providerId === 'codex' && failCodexTestOnce) {
        failCodexTestOnce = false;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Falha controlada nas fixtures.' }),
        });
      }

      const payload = keysFixture.tests[providerId] ?? {
        provider_id: providerId,
        status: 'healthy',
        latency_ms: 150,
        tested_at: new Date().toISOString(),
        message: 'Fixture genérica executada.',
      };

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    });

    await page.route('**/api/v1/secrets/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const segments = url.pathname.split('/').filter(Boolean);
      const providerId = decodeURIComponent(segments[segments.length - 1] ?? '');

      if (request.method() === 'GET') {
        const value = keysFixture.values[providerId];
        if (!value) {
          return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Secret not found' }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
      }

      if (request.method() === 'PUT') {
        const body = request.postDataJSON() as { value?: string };
        const trimmed = (body?.value ?? '').trim();
        if (!trimmed) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Valor inválido' }),
          });
        }

        const record = {
          provider_id: providerId,
          value: trimmed,
          updated_at: new Date('2025-03-07T18:00:00Z').toISOString(),
        };
        keysFixture.values[providerId] = record;
        const existing = keysFixture.secrets.find((item) => item.provider_id === providerId);
        if (existing) {
          existing.has_secret = true;
          existing.updated_at = record.updated_at;
        } else {
          keysFixture.secrets.push({ provider_id: providerId, has_secret: true, updated_at: record.updated_at });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) });
      }

      if (request.method() === 'DELETE') {
        if (failDeleteOnce) {
          failDeleteOnce = false;
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Erro de remoção controlado.' }),
          });
        }

        delete keysFixture.values[providerId];
        const existing = keysFixture.secrets.find((item) => item.provider_id === providerId);
        if (existing) {
          existing.has_secret = false;
          existing.updated_at = null;
        }
        return route.fulfill({ status: 204, contentType: 'application/json', body: '' });
      }

      return route.fallback();
    });
  });

  test('realiza cadastro, teste e remoção de credenciais com feedback visual', async ({ page }) => {
    await page.goto('/?view=keys');

    await expect(page.getByRole('heading', { name: 'Chaves MCP · gestão segura' })).toBeVisible();

    const summary = page.locator('.keys__summary .key-stat strong');
    const totalProviders = providersFixture.providers.length;
    let configuredCount = keysFixture.secrets.filter((secret) => secret.has_secret).length;
    const testedProviders = new Set<string>();

    await expect(summary.nth(0)).toHaveText(String(totalProviders));
    await expect(summary.nth(1)).toHaveText(String(configuredCount));
    await expect(summary.nth(2)).toHaveText(String(totalProviders - configuredCount));
    await expect(summary.nth(3)).toHaveText('0');

    const geminiCard = page.locator('.key-card').filter({ hasText: 'Gemini MCP' });
    await geminiCard.getByRole('button', { name: 'Atualizar chave' }).click();

    const geminiInput = geminiCard.getByLabel('Chave de acesso');
    await expect(geminiInput).not.toHaveValue('');
    await geminiInput.fill('sk-gemini-atualizada');
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/v1/secrets/gemini') && request.method() === 'PUT'),
      page.getByRole('button', { name: 'Salvar agora' }).click(),
    ]);

    await expect(geminiCard.getByRole('button', { name: 'Atualizar chave' })).toBeVisible();
    await geminiCard.getByRole('button', { name: 'Testar conectividade' }).click();
    await expect(geminiCard).toContainText('Handshake saudável');
    testedProviders.add('gemini');

    const codexCard = page.locator('.key-card').filter({ hasText: 'Codex CLI' });
    await codexCard.getByRole('button', { name: 'Configurar chave' }).click();

    const codexInput = codexCard.getByLabel('Chave de acesso');
    await codexCard.getByRole('button', { name: 'Salvar agora' }).click();
    await expect(codexCard.locator('.key-form__error')).toHaveText('Informe uma chave válida.');

    await codexInput.fill('sk-codex-valid');
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/v1/secrets/codex') && request.method() === 'PUT'),
      codexCard.getByRole('button', { name: 'Salvar agora' }).click(),
    ]);
    await expect(codexCard.getByRole('button', { name: 'Atualizar chave' })).toBeVisible();
    configuredCount += 1;

    await codexCard.getByRole('button', { name: 'Testar conectividade' }).click();
    await expect(codexCard).toContainText('Handshake saudável');
    testedProviders.add('codex');
    await codexCard.getByRole('button', { name: 'Testar conectividade' }).click();
    await expect(codexCard).toContainText('Handshake saudável');

    await geminiCard.getByRole('button', { name: 'Atualizar chave' }).click();
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/v1/secrets/gemini') && request.method() === 'DELETE'),
      page.getByRole('button', { name: 'Remover chave' }).click(),
    ]);
    await expect(geminiCard.getByRole('button', { name: 'Configurar chave' })).toBeVisible();
    await expect(geminiCard.locator('.key-status-badge')).toContainText('Credencial pendente');
    if (configuredCount > 0) {
      configuredCount -= 1;
    }
    testedProviders.delete('gemini');

    const [totalText, configuredText, attentionText, testedText] = await summary.allTextContents();
    expect(Number(totalText)).toBe(totalProviders);
    expect(Number(configuredText)).toBe(configuredCount);
    const expectedAttention = totalProviders - configuredCount;
    expect(Number(attentionText)).toBe(expectedAttention);
    expect(Number(testedText)).toBe(testedProviders.size);
  });
});
