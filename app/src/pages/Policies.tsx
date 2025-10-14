import { useMemo, useState } from 'react';

import type { ProviderSummary } from '../api';
import PolicyTemplatePicker, {
  type PolicyTemplate,
  type PolicyTemplateId,
} from '../components/PolicyTemplatePicker';
import { seededMod } from '../utils/hash';

export interface PoliciesProps {
  providers: ProviderSummary[];
  isLoading: boolean;
  initialError: string | null;
}

interface PolicyDeployment {
  templateId: PolicyTemplateId;
  deployedAt: string;
  author: string;
  window: string;
  note: string;
}

interface RolloutSegment {
  id: 'canary' | 'general' | 'fallback';
  label: string;
  description: string;
  range: [number, number];
}

interface RolloutPlanEntry {
  segment: RolloutSegment;
  providers: ProviderSummary[];
  coverage: number;
}

const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    id: 'economy',
    name: 'Economia',
    tagline: 'FinOps primeiro',
    description:
      'Prioriza custo absoluto e direciona a maior parte do tráfego para modelos econômicos com fallback gradual.',
    priceDelta: '-22% vs. baseline',
    latencyTarget: 'até 4.0 s P95',
    guardrailLevel: 'Nível 2 · Moderado',
    features: [
      'Roteia 70% das requisições para modelos Economy e Lite',
      'Fallback manual para turbos em incidentes de SLA',
      'Throttling progressivo por projeto e custo acumulado',
    ],
  },
  {
    id: 'balanced',
    name: 'Equilíbrio',
    tagline: 'Balanceamento inteligente',
    description:
      'Combina custo/latência com seleção automática do melhor modelo por rota de negócio, incluindo failover automático.',
    priceDelta: '-12% vs. baseline',
    latencyTarget: 'até 2.5 s P95',
    guardrailLevel: 'Nível 3 · Avançado',
    features: [
      'Roteamento adaptativo por capacidade e disponibilidade',
      'Failover automático com circuito aberto em 30s',
      'Políticas de custo dinâmicas por equipe/projeto',
    ],
  },
  {
    id: 'turbo',
    name: 'Turbo',
    tagline: 'Velocidade máxima',
    description:
      'Entrega a menor latência possível e mantém modelos premium sempre quentes, com alertas agressivos de custo.',
    priceDelta: '+18% vs. baseline',
    latencyTarget: 'até 900 ms P95',
    guardrailLevel: 'Nível 4 · Crítico',
    features: [
      'Pré-aquecimento de modelos turbo em múltiplas regiões',
      'Orçamento observável com limites hora a hora',
      'Expansão automática de capacidade sob demanda',
    ],
  },
];

const TEMPLATE_MAP = new Map(POLICY_TEMPLATES.map((template) => [template.id, template]));

const ROLLOUT_SEGMENTS: RolloutSegment[] = [
  {
    id: 'canary',
    label: 'Canário · 15%',
    description: 'Rotas críticas monitoradas em tempo real com dashboards dedicados.',
    range: [0, 34],
  },
  {
    id: 'general',
    label: 'GA · 65%',
    description: 'Workloads padrão com fallback automático e monitoramento de custos.',
    range: [34, 78],
  },
  {
    id: 'fallback',
    label: 'Fallback · 20%',
    description: 'Rotas sensíveis com janela de rollback dedicada e dupla validação.',
    range: [78, 101],
  },
];

function createInitialHistory(): PolicyDeployment[] {
  const now = Date.now();
  return [
    {
      templateId: 'economy',
      deployedAt: new Date(now - 1000 * 60 * 60 * 24 * 28).toISOString(),
      author: 'FinOps Squad',
      window: 'Canário 5% → 20%',
      note: 'Piloto para squads orientados a custo.',
    },
    {
      templateId: 'balanced',
      deployedAt: new Date(now - 1000 * 60 * 60 * 24 * 3).toISOString(),
      author: 'Console MCP',
      window: 'GA progressivo',
      note: 'Promoção Q2 liberada para toda a frota.',
    },
  ];
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildRolloutPlan(providers: ProviderSummary[], templateId: PolicyTemplateId): RolloutPlanEntry[] {
  const total = providers.length;
  return ROLLOUT_SEGMENTS.map((segment) => {
    const entries = providers.filter((provider) => {
      const score = seededMod(`${provider.id}-${templateId}-rollout`, 100);
      return score >= segment.range[0] && score < segment.range[1];
    });

    const coverage = total === 0 ? 0 : Math.round((entries.length / total) * 100);
    return { segment, providers: entries, coverage };
  });
}

function computeReliability(templateId: PolicyTemplateId): { sloP95: number; budgetUsage: number; incidents: number } {
  const sloP95 = 480 + seededMod(`${templateId}-slo`, 520);
  const budgetUsage = 62 + seededMod(`${templateId}-budget`, 24);
  const incidents = seededMod(`${templateId}-incidents`, 4);
  return { sloP95, budgetUsage, incidents };
}

function computeGuardrailScore(templateId: PolicyTemplateId): number {
  return 68 + seededMod(`${templateId}-guardrail`, 18);
}

type BannerKind = 'success' | 'info' | 'warning';

export default function Policies({ providers, isLoading, initialError }: PoliciesProps) {
  const [history, setHistory] = useState<PolicyDeployment[]>(() => createInitialHistory());
  const [selectedTemplateId, setSelectedTemplateId] = useState<PolicyTemplateId>(
    () => history[history.length - 1].templateId,
  );
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null);

  const activeDeployment = history[history.length - 1];
  const activeTemplate = TEMPLATE_MAP.get(activeDeployment.templateId)!;
  const previousDeployment = history.length > 1 ? history[history.length - 2] : null;
  const previousTemplate = previousDeployment ? TEMPLATE_MAP.get(previousDeployment.templateId)! : null;

  const rolloutPlan = useMemo(() => buildRolloutPlan(providers, selectedTemplateId), [providers, selectedTemplateId]);
  const activeReliability = useMemo(
    () => computeReliability(activeDeployment.templateId),
    [activeDeployment.templateId],
  );
  const guardrailScore = useMemo(
    () => computeGuardrailScore(activeDeployment.templateId),
    [activeDeployment.templateId],
  );

  const selectedTemplate = TEMPLATE_MAP.get(selectedTemplateId)!;
  const canRollback = Boolean(previousDeployment);

  function handleApply() {
    if (selectedTemplateId === activeDeployment.templateId) {
      setBanner({ kind: 'info', message: 'O template selecionado já está ativo na frota MCP.' });
      return;
    }

    const timestamp = new Date().toISOString();
    setHistory((current) => [
      ...current,
      {
        templateId: selectedTemplateId,
        deployedAt: timestamp,
        author: 'Console MCP',
        window: 'Rollout monitorado',
        note: `Rollout manual: ${selectedTemplate.name}.`,
      },
    ]);
    setBanner({ kind: 'success', message: `${selectedTemplate.name} ativado para toda a frota.` });
  }

  function handleRollback() {
    if (!previousDeployment || !previousTemplate) {
      return;
    }

    setHistory((current) => current.slice(0, -1));
    setSelectedTemplateId(previousDeployment.templateId);
    setBanner({ kind: 'warning', message: `Rollback concluído para ${previousTemplate.name}.` });
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
              <dd>{formatDateTime(activeDeployment.deployedAt)}</dd>
            </div>
            <div>
              <dt>Autor</dt>
              <dd>{activeDeployment.author}</dd>
            </div>
            <div>
              <dt>Janela</dt>
              <dd>{activeDeployment.window}</dd>
            </div>
          </dl>
          <ul className="policy-overview__metrics">
            <li>
              <span>P95 observado</span>
              <strong>{activeReliability.sloP95} ms</strong>
            </li>
            <li>
              <span>Uso de budget</span>
              <strong>{activeReliability.budgetUsage}%</strong>
            </li>
            <li>
              <span>Incidentes em 30 dias</span>
              <strong>{activeReliability.incidents}</strong>
            </li>
            <li>
              <span>Guardrail score</span>
              <strong>{guardrailScore}</strong>
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
              <dd>{previousDeployment ? previousDeployment.note : '—'}</dd>
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
        <PolicyTemplatePicker
          templates={POLICY_TEMPLATES}
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
          disabled={isLoading}
        />
      </section>

      <div className="policies__actions">
        <button type="button" className="policy-action policy-action--primary" onClick={handleApply}>
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
        </header>
        <ul className="rollout-plan">
          {rolloutPlan.map((entry) => (
            <li key={entry.segment.id} className="rollout-plan__item">
              <div className="rollout-plan__summary">
                <h3>{entry.segment.label}</h3>
                <p>{entry.segment.description}</p>
                <span className="rollout-plan__coverage">Cobertura: {entry.coverage}%</span>
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
      </section>

      <section className="policies__history">
        <header>
          <h2>Histórico de deploys</h2>
          <p>Acompanhe os templates aplicados na frota e os motivos registrados.</p>
        </header>
        <ol className="policy-history">
          {[...history]
            .slice()
            .reverse()
            .map((deployment) => {
              const template = TEMPLATE_MAP.get(deployment.templateId)!;
              return (
                <li key={`${deployment.templateId}-${deployment.deployedAt}`}>
                  <div className="policy-history__header">
                    <span className="policy-history__template">{template.name}</span>
                    <time dateTime={deployment.deployedAt}>{formatDateTime(deployment.deployedAt)}</time>
                  </div>
                  <p>{deployment.note}</p>
                  <span className="policy-history__meta">{deployment.author} · {deployment.window}</span>
                </li>
              );
            })}
        </ol>
      </section>
    </main>
  );
}
