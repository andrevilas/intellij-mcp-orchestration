import { useEffect, useMemo, useState } from 'react';

import {
  createPolicyDeployment,
  deletePolicyDeployment,
  fetchPolicyDeployments,
  fetchPolicyTemplates,
  type PolicyDeployment,
  type PolicyRolloutAllocation,
  type PolicyTemplate,
  type PolicyTemplateId,
  type ProviderSummary,
} from '../api';
import PolicyTemplatePicker from '../components/PolicyTemplatePicker';

export interface PoliciesProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

const FALLBACK_TEMPLATE_ID: PolicyTemplateId = 'economy';

const EMPTY_TEMPLATE: PolicyTemplate = {
  id: FALLBACK_TEMPLATE_ID,
  name: 'Template indisponível',
  tagline: '—',
  description: 'Não foi possível carregar os templates de política no momento.',
  priceDelta: '—',
  latencyTarget: '—',
  guardrailLevel: '—',
  features: [],
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type BannerKind = 'success' | 'info' | 'warning';

export default function Policies({ providers, isLoading, initialError }: PoliciesProps) {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<PolicyDeployment[]>([]);
  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<PolicyTemplateId>(FALLBACK_TEMPLATE_ID);
  const [isMutating, setIsMutating] = useState(false);
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null);
  const [rolloutPlans, setRolloutPlans] = useState<Map<PolicyTemplateId, PolicyRolloutAllocation[]>>(new Map());
  const [rolloutTimestamp, setRolloutTimestamp] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadTemplates() {
      setIsTemplatesLoading(true);
      setTemplatesError(null);
      try {
        const catalog = await fetchPolicyTemplates(controller.signal);
        if (!active) {
          return;
        }
        setTemplates(catalog.templates);
        if (catalog.rollout) {
          const planMap = new Map<PolicyTemplateId, PolicyRolloutAllocation[]>();
          catalog.rollout.plans.forEach((plan) => {
            planMap.set(plan.templateId as PolicyTemplateId, plan.allocations);
          });
          setRolloutPlans(planMap);
          setRolloutTimestamp(catalog.rollout.generatedAt);
        } else {
          setRolloutPlans(new Map());
          setRolloutTimestamp(null);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to load policy templates', error);
        setTemplatesError('Não foi possível carregar templates de política.');
      } finally {
        if (active) {
          setIsTemplatesLoading(false);
        }
      }
    }

    loadTemplates();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadDeployments() {
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const summary = await fetchPolicyDeployments(controller.signal);
        if (!active) {
          return;
        }
        setDeployments(summary.deployments);
        setActiveDeploymentId(summary.activeId);
      } catch (error) {
        if (!active) {
          return;
        }
        if ((error as { name?: string }).name === 'AbortError') {
          return;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to load policy deployments', error);
        setHistoryError('Não foi possível carregar o histórico de deploys.');
      } finally {
        if (active) {
          setIsHistoryLoading(false);
        }
      }
    }

    loadDeployments();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const templateMap = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );

  const activeDeployment = useMemo(() => {
    if (deployments.length === 0) {
      return null;
    }
    if (activeDeploymentId) {
      const match = deployments.find((deployment) => deployment.id === activeDeploymentId);
      if (match) {
        return match;
      }
    }
    return deployments[deployments.length - 1];
  }, [deployments, activeDeploymentId]);

  useEffect(() => {
    if (activeDeployment) {
      setSelectedTemplateId(activeDeployment.templateId as PolicyTemplateId);
    }
  }, [activeDeployment?.templateId]);

  const fallbackTemplate = templates[0] ?? EMPTY_TEMPLATE;
  const activeTemplate = activeDeployment
    ? templateMap.get(activeDeployment.templateId as PolicyTemplateId) ?? fallbackTemplate
    : fallbackTemplate;
  const activeIndex = activeDeployment ? deployments.findIndex((item) => item.id === activeDeployment.id) : -1;
  const previousDeployment = activeIndex > 0 ? deployments[activeIndex - 1] : null;
  const previousTemplate = previousDeployment
    ? templateMap.get(previousDeployment.templateId as PolicyTemplateId) ?? fallbackTemplate
    : null;

  const rolloutPlan = rolloutPlans.get(selectedTemplateId) ?? [];
  const activeReliability = activeDeployment
    ? {
        sloP95: activeDeployment.sloP95Ms,
        budgetUsage: activeDeployment.budgetUsagePct,
        incidents: activeDeployment.incidentsCount,
      }
    : null;
  const guardrailScore = activeDeployment?.guardrailScore ?? null;

  useEffect(() => {
    if (templates.length === 0) {
      return;
    }
    if (!templateMap.has(selectedTemplateId)) {
      const fallbackId = (
        (activeDeployment?.templateId as PolicyTemplateId | undefined) ??
        templates[templates.length - 1]?.id ??
        FALLBACK_TEMPLATE_ID
      ) as PolicyTemplateId;
      setSelectedTemplateId(fallbackId);
    }
  }, [templateMap, selectedTemplateId, templates, activeDeployment?.templateId]);

  const selectedTemplate = templateMap.get(selectedTemplateId) ?? fallbackTemplate;
  const disableActions = isMutating || isTemplatesLoading || isHistoryLoading;
  const canRollback = Boolean(previousDeployment) && !disableActions;

  async function handleApply() {
    if (disableActions) {
      return;
    }

    if (activeDeployment && selectedTemplateId === (activeDeployment.templateId as PolicyTemplateId)) {
      setBanner({ kind: 'info', message: 'O template selecionado já está ativo na frota MCP.' });
      return;
    }

    setIsMutating(true);
    setBanner(null);
    try {
      const deployment = await createPolicyDeployment(
        {
          templateId: selectedTemplateId,
          author: 'Console MCP',
          window: 'Rollout monitorado',
          note: `Rollout manual: ${selectedTemplate.name}.`,
        },
      );
      setDeployments((current) => [...current, deployment]);
      setActiveDeploymentId(deployment.id);
      setBanner({ kind: 'success', message: `${selectedTemplate.name} ativado para toda a frota.` });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to apply policy template', error);
      setBanner({ kind: 'warning', message: 'Não foi possível aplicar o template selecionado. Tente novamente.' });
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRollback() {
    if (!previousDeployment || !previousTemplate || !activeDeployment || disableActions) {
      return;
    }

    setIsMutating(true);
    setBanner(null);
    try {
      await deletePolicyDeployment(activeDeployment.id);
      setDeployments((current) => current.filter((item) => item.id !== activeDeployment.id));
      setActiveDeploymentId(previousDeployment.id);
      setSelectedTemplateId(previousDeployment.templateId as PolicyTemplateId);
      setBanner({ kind: 'warning', message: `Rollback concluído para ${previousTemplate.name}.` });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to rollback policy deployment', error);
      setBanner({ kind: 'warning', message: 'Falha ao realizar rollback. Tente novamente.' });
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <main className="policies">
      <section className="policies__hero">
        <h1>Políticas MCP · roteamento inteligente</h1>
        <p>
          Modele custos, latência e guardrails de cada rota com templates opinativos. Aplique canários, faça rollback em um
          clique e acompanhe o impacto sobre provedores MCP em tempo real.
        </p>
      </section>

      <section className="policies__status" aria-label="Resumo do template ativo">
        <article className="policy-overview">
          <header>
            <span>Template ativo</span>
            <h2>{activeTemplate.name}</h2>
          </header>
          <p>{activeTemplate.description}</p>
          <dl>
            <div>
              <dt>Último deploy</dt>
              <dd>{activeDeployment ? formatDateTime(activeDeployment.deployedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Autor</dt>
              <dd>{activeDeployment ? activeDeployment.author : '—'}</dd>
            </div>
            <div>
              <dt>Janela</dt>
              <dd>{activeDeployment && activeDeployment.window ? activeDeployment.window : '—'}</dd>
            </div>
          </dl>
          <ul className="policy-overview__metrics">
            <li>
              <span>P95 observado</span>
              <strong>{activeReliability ? `${activeReliability.sloP95} ms` : '—'}</strong>
            </li>
            <li>
              <span>Uso de budget</span>
              <strong>{activeReliability ? `${activeReliability.budgetUsage}%` : '—'}</strong>
            </li>
            <li>
              <span>Incidentes em 30 dias</span>
              <strong>{activeReliability ? activeReliability.incidents : '—'}</strong>
            </li>
            <li>
              <span>Guardrail score</span>
              <strong>{guardrailScore ?? '—'}</strong>
            </li>
          </ul>
        </article>

        <article className="policy-overview policy-overview--secondary">
          <header>
            <span>Pronto para rollback</span>
            <h2>{previousTemplate ? previousTemplate.name : 'Sem histórico'}</h2>
          </header>
          <p>
            {previousTemplate
              ? `Rollback imediato recupera o template ${previousTemplate.name} sem perda de histórico.`
              : 'Quando houver outro deploy registrado, você poderá reverter em um clique.'}
          </p>
          <dl>
            <div>
              <dt>Última alteração</dt>
              <dd>{previousDeployment ? formatDateTime(previousDeployment.deployedAt) : '—'}</dd>
            </div>
            <div>
              <dt>Autor</dt>
              <dd>{previousDeployment ? previousDeployment.author : '—'}</dd>
            </div>
            <div>
              <dt>Nota</dt>
              <dd>{previousDeployment && previousDeployment.note ? previousDeployment.note : '—'}</dd>
            </div>
          </dl>
        </article>
      </section>

      {banner && <p className={`policy-banner policy-banner--${banner.kind}`}>{banner.message}</p>}
      {isLoading && <p className="info">Calculando políticas recomendadas…</p>}
      {initialError && <p className="error">{initialError}</p>}

      <section className="policies__templates">
        <header className="policies__templates-header">
          <h2>Templates opinativos</h2>
          <p>
            Compare latência, custo e guardrails por template. A seleção abaixo ajusta o plano de rollout proposto antes de
            aplicar.
          </p>
        </header>
        {isTemplatesLoading && <p className="status">Carregando templates atualizados…</p>}
        {templatesError && <p className="error">{templatesError}</p>}
        <PolicyTemplatePicker
          templates={templates}
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
          disabled={disableActions || isLoading}
        />
      </section>

      <div className="policies__actions">
        <button
          type="button"
          className="policy-action policy-action--primary"
          onClick={handleApply}
          disabled={disableActions}
        >
          Aplicar template
        </button>
        <button
          type="button"
          className="policy-action policy-action--ghost"
          onClick={handleRollback}
          disabled={!canRollback}
        >
          Rollback imediato
        </button>
      </div>

      <section className="policies__plan">
        <header>
          <h2>Plano de rollout</h2>
          <p>
            Distribuição sugerida para o template <strong>{selectedTemplate.name}</strong> considerando criticidade e
            capacidade dos servidores MCP cadastrados.
          </p>
          <span className="rollout-plan__timestamp">
            Última atualização: {rolloutTimestamp ? formatDateTime(rolloutTimestamp) : '—'}
          </span>
        </header>
        {rolloutPlan.length === 0 ? (
          <p className="status">
            Nenhum plano de rollout disponível para o template selecionado.
            {providers.length > 0 && ' Registre um deploy para gerar a distribuição entre os provedores cadastrados.'}
          </p>
        ) : (
          <ul className="rollout-plan">
            {rolloutPlan.map((entry) => (
              <li key={entry.segment.id} className="rollout-plan__item">
                <div className="rollout-plan__summary">
                  <h3>
                    {entry.segment.name}
                    <span className="rollout-plan__coverage"> · {entry.coverage}%</span>
                  </h3>
                  <p>{entry.segment.description}</p>
                </div>
                <div className="rollout-plan__providers" aria-live="polite">
                  {entry.providers.length > 0 ? (
                    entry.providers.map((provider) => (
                      <span key={provider.id} className="rollout-chip">
                        {provider.name}
                      </span>
                    ))
                  ) : (
                    <span className="rollout-chip rollout-chip--muted">Sem servidores neste estágio</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="policies__history">
        <header>
          <h2>Histórico de deploys</h2>
          <p>Acompanhe os templates aplicados na frota e os motivos registrados.</p>
        </header>
        {isHistoryLoading && <p className="status">Carregando histórico de deploys…</p>}
        {historyError && <p className="error">{historyError}</p>}
        <ol className="policy-history">
          {deployments
            .slice()
            .reverse()
            .map((deployment) => {
              const template = templateMap.get(deployment.templateId as PolicyTemplateId) ?? fallbackTemplate;
              return (
                <li key={`${deployment.id}`}>
                  <div className="policy-history__header">
                    <span className="policy-history__template">{template.name}</span>
                    <time dateTime={deployment.deployedAt}>{formatDateTime(deployment.deployedAt)}</time>
                  </div>
                  <p>{deployment.note ?? '—'}</p>
                  <span className="policy-history__meta">
                    {deployment.author} · {deployment.window ?? '—'}
                  </span>
                </li>
              );
            })}
          {deployments.length === 0 && !isHistoryLoading && !historyError && (
            <li className="policy-history__empty">Nenhum deploy registrado até o momento.</li>
          )}
        </ol>
      </section>
    </main>
  );
}
