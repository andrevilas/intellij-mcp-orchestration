import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  fetchMarketplaceEntries,
  importMarketplaceEntry,
  type MarketplaceEntry,
  type MarketplaceImportResponse,
} from '../api';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function useMarketplaceCatalog() {
  const [entries, setEntries] = useState<MarketplaceEntry[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    fetchMarketplaceEntries()
      .then((items) => {
        if (!isMounted) {
          return;
        }
        setEntries(items);
      })
      .catch((cause) => {
        if (!isMounted) {
          return;
        }
        const message = cause instanceof Error ? cause.message : 'Falha ao carregar o marketplace.';
        setError(message);
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return { entries, isLoading, error };
}

export default function Marketplace() {
  const { entries, isLoading, error } = useMarketplaceCatalog();
  const [query, setQuery] = useState('');
  const [originFilter, setOriginFilter] = useState<'all' | string>('all');
  const [minRating, setMinRating] = useState(0);
  const [maxCost, setMaxCost] = useState<string>('');
  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<MarketplaceImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const origins = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.origin) {
        set.add(entry.origin);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    const maxCostValue = parseFloat(maxCost);
    return entries.filter((entry) => {
      if (originFilter !== 'all' && entry.origin !== originFilter) {
        return false;
      }
      if (entry.rating < minRating) {
        return false;
      }
      if (!Number.isNaN(maxCostValue) && maxCostValue >= 0 && entry.cost > maxCostValue) {
        return false;
      }
      if (normalizedQuery) {
        const haystack = [
          entry.name,
          entry.summary,
          entry.description ?? '',
          entry.tags.join(' '),
          entry.capabilities.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, originFilter, minRating, maxCost, query]);

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const handleImport = async (entry: MarketplaceEntry) => {
    setImportError(null);
    setImporting(entry.id);
    try {
      const result = await importMarketplaceEntry(entry.id);
      setImportResult(result);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Falha ao importar o agente selecionado.';
      setImportError(message);
      setImportResult(null);
    } finally {
      setImporting(null);
    }
  };

  return (
    <section className="marketplace" aria-labelledby="marketplace-title">
      <header className="marketplace__header">
        <div>
          <h1 id="marketplace-title">Marketplace de Agentes</h1>
          <p className="marketplace__subtitle">
            Descubra agentes verificados, compare metadados e gere planos via Config Assistant com verificação de
            assinatura automática antes da instalação.
          </p>
        </div>
      </header>

      <form className="marketplace__filters" onSubmit={handleFilterSubmit}>
        <label className="marketplace__field marketplace__field--search">
          <span>Pesquisar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busque por nome, tag ou capacidade"
          />
        </label>
        <label className="marketplace__field">
          <span>Origem</span>
          <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}>
            <option value="all">Todas</option>
            {origins.map((origin) => (
              <option key={origin} value={origin}>
                {origin}
              </option>
            ))}
          </select>
        </label>
        <label className="marketplace__field">
          <span>Rating mínimo</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={minRating}
            onChange={(event) => setMinRating(Number(event.target.value))}
          />
          <span className="marketplace__range-value">{minRating.toFixed(1)}</span>
        </label>
        <label className="marketplace__field">
          <span>Custo máx. estimado (USD)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={maxCost}
            onChange={(event) => setMaxCost(event.target.value)}
            placeholder="Sem limite"
          />
        </label>
      </form>

      {isLoading ? (
        <p className="marketplace__status">Carregando catálogo…</p>
      ) : error ? (
        <p className="marketplace__status marketplace__status--error" role="alert">
          {error}
        </p>
      ) : filteredEntries.length === 0 ? (
        <p className="marketplace__status">Nenhum agente encontrado com os filtros atuais.</p>
      ) : (
        <div className="marketplace__grid" role="list">
          {filteredEntries.map((entry) => (
            <article key={entry.id} className="marketplace-card" role="listitem">
              <header className="marketplace-card__header">
                <div>
                  <h2>{entry.name}</h2>
                  <p className="marketplace-card__summary">{entry.summary}</p>
                </div>
                <div className="marketplace-card__meta">
                  <span className="marketplace-card__origin" aria-label={`Origem ${entry.origin}`}>
                    {entry.origin}
                  </span>
                  <span className="marketplace-card__rating" aria-label={`Avaliação ${entry.rating.toFixed(1)}`}>
                    ⭐ {entry.rating.toFixed(1)}
                  </span>
                  <span className="marketplace-card__cost" aria-label={`Custo estimado ${entry.cost.toFixed(2)} USD`}>
                    ${entry.cost.toFixed(2)}
                  </span>
                </div>
              </header>
              {entry.description ? <p className="marketplace-card__description">{entry.description}</p> : null}
              <dl className="marketplace-card__details">
                <div>
                  <dt>Tags</dt>
                  <dd>{entry.tags.length > 0 ? entry.tags.join(', ') : 'Sem tags'}</dd>
                </div>
                <div>
                  <dt>Capacidades</dt>
                  <dd>{entry.capabilities.length > 0 ? entry.capabilities.join(', ') : 'Não informado'}</dd>
                </div>
              </dl>
              <footer className="marketplace-card__footer">
                <button
                  type="button"
                  className="marketplace-card__action"
                  onClick={() => handleImport(entry)}
                  disabled={importing === entry.id}
                >
                  {importing === entry.id ? 'Gerando plano…' : 'Importar via Config Assistant'}
                </button>
                {entry.repositoryUrl ? (
                  <a className="marketplace-card__link" href={entry.repositoryUrl} target="_blank" rel="noreferrer">
                    Repositório de origem
                  </a>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}

      {importError ? (
        <p className="marketplace__status marketplace__status--error" role="alert">
          {importError}
        </p>
      ) : null}

      {importResult ? (
        <section className="marketplace__import" aria-live="polite">
          <header>
            <h2>Plano gerado para {importResult.entry.name}</h2>
            <p>
              Assinatura verificada com sucesso. Revise o plano sugerido e execute os passos pelo Config Assistant para
              aplicar no repositório {importResult.entry.targetRepository}.
            </p>
          </header>
          <div className="marketplace__import-grid">
            <div className="marketplace__import-column">
              <h3>Passos do plano</h3>
              <ol className="marketplace__steps">
                {importResult.plan.steps.map((step) => (
                  <li key={step.id}>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                    {step.dependsOn.length > 0 ? (
                      <p className="marketplace__step-deps">Depende de: {step.dependsOn.join(', ')}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
              {importResult.plan.risks.length > 0 ? (
                <div className="marketplace__risks">
                  <h4>Riscos monitorados</h4>
                  <ul>
                    {importResult.plan.risks.map((risk, index) => (
                      <li key={`${risk.title}-${index}`}>
                        <strong>{risk.title}</strong>: {risk.mitigation || 'Mitigação em aberto.'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="marketplace__import-column">
              <h3>agent.yaml</h3>
              <pre className="marketplace__code" aria-label="Conteúdo do manifesto">
                <code>{importResult.manifest}</code>
              </pre>
              {importResult.agentCode ? (
                <>
                  <h3>agent.py</h3>
                  <pre className="marketplace__code" aria-label="Conteúdo do módulo">
                    <code>{importResult.agentCode}</code>
                  </pre>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );
}
