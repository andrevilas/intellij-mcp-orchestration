import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  applyGovernedConfigReload,
  planGovernedConfigReload,
  type ConfigPlan,
  type ConfigPlanDiffSummary,
  type ConfigPlanPayload,
  type ConfigReloadRequest,
  type GovernedConfigReloadApplyResponse,
} from '../api';
import PlanDiffViewer, { type PlanDiffItem } from './PlanDiffViewer';
import AuditTrailPanel from './AuditTrailPanel';

interface SupportedArtifact {
  id: string;
  label: string;
  placeholderPath: string;
  placeholderParameters?: string;
}

interface ReloadHistoryEntry {
  id: string;
  status: string;
  actor: string;
  timestamp: string;
  message: string;
  branch?: string | null;
  pullRequestUrl?: string | null;
}

interface AuditEventItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  description: string;
  metadata: Record<string, unknown> | null;
}

const SUPPORTED_ARTIFACTS: SupportedArtifact[] = [
  {
    id: 'agent.manifest',
    label: 'Manifesto MCP',
    placeholderPath: 'agents-hub/app/agents/<slug>/agent.yaml',
    placeholderParameters: '{"owner":"platform-team","capabilities":["structured-output"]}',
  },
  {
    id: 'agent.readme',
    label: 'README do agente',
    placeholderPath: 'agents-hub/app/agents/<slug>/README.md',
    placeholderParameters: '{"owner":"platform-team"}',
  },
  {
    id: 'agent.langgraph',
    label: 'Stub LangGraph',
    placeholderPath: 'agents-hub/app/agents/<slug>/agent.py',
    placeholderParameters: '{"tool_name":"demo_tool"}',
  },
  {
    id: 'finops.checklist',
    label: 'Checklist FinOps',
    placeholderPath: 'generated/finops/checklist.md',
    placeholderParameters: '{"owner":"finops-team","checklist_title":"Revisão mensal"}',
  },
];

const DEFAULT_COMMIT = 'chore: regerar artefato MCP';

function createDiffItems(diffs: ConfigPlanDiffSummary[]): PlanDiffItem[] {
  return diffs.map((diff) => ({
    id: diff.path,
    title: diff.path,
    summary: diff.summary,
    diff: diff.diff ?? undefined,
  }));
}

function buildAuditEventId(): string {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `audit-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function resolveArtifactConfig(artifactId: string): SupportedArtifact {
  return SUPPORTED_ARTIFACTS.find((item) => item.id === artifactId) ?? SUPPORTED_ARTIFACTS[0];
}

export default function ConfigReloadAction() {
  const [artifactId, setArtifactId] = useState<string>(SUPPORTED_ARTIFACTS[0].id);
  const [targetPath, setTargetPath] = useState<string>(SUPPORTED_ARTIFACTS[0].placeholderPath);
  const [parameters, setParameters] = useState<string>(SUPPORTED_ARTIFACTS[0].placeholderParameters ?? '');
  const [justification, setJustification] = useState('');
  const [actor, setActor] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [commitMessage, setCommitMessage] = useState(DEFAULT_COMMIT);

  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<ConfigPlan | null>(null);
  const [planPayload, setPlanPayload] = useState<ConfigPlanPayload | null>(null);
  const [patch, setPatch] = useState('');

  const [history, setHistory] = useState<ReloadHistoryEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [isAuditOpen, setAuditOpen] = useState(false);

  const [planError, setPlanError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedArtifact = useMemo(() => resolveArtifactConfig(artifactId), [artifactId]);

  useEffect(() => {
    setTargetPath(selectedArtifact.placeholderPath);
    setParameters(selectedArtifact.placeholderParameters ?? '');
  }, [selectedArtifact]);

  const diffItems = useMemo<PlanDiffItem[]>(() => (plan ? createDiffItems(plan.diffs) : []), [plan]);

  const resetPlanState = useCallback(() => {
    setPlanId(null);
    setPlan(null);
    setPlanPayload(null);
    setPatch('');
    setJustification('');
    setApplyError(null);
  }, []);

  const publishAuditEvent = useCallback(
    (event: Omit<AuditEventItem, 'id' | 'timestamp'> & { timestamp?: string }) => {
      const timestamp = event.timestamp ?? new Date().toISOString();
      const entry: AuditEventItem = {
        id: buildAuditEventId(),
        timestamp,
        actor: event.actor,
        action: event.action,
        target: event.target,
        description: event.description,
        metadata: event.metadata ?? null,
      };
      setAuditEvents((current) => [entry, ...current]);
    },
    [],
  );

  const handlePlan = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedTarget = targetPath.trim();
      if (!trimmedTarget) {
        setPlanError('Informe o caminho de destino do artefato.');
        return;
      }

      let parsedParameters: ConfigReloadRequest['parameters'];
      if (parameters.trim()) {
        try {
          parsedParameters = JSON.parse(parameters);
        } catch (error) {
          console.error('Invalid reload parameters', error);
          setPlanError('Parâmetros devem ser um JSON válido.');
          return;
        }
      }

      setPlanLoading(true);
      setPlanError(null);
      setApplyError(null);
      setSuccessMessage(null);

      try {
        const response = await planGovernedConfigReload({
          artifactType: artifactId,
          targetPath: trimmedTarget,
          parameters: parsedParameters,
        });
        setPlanId(response.planId);
        setPlan(response.plan);
        setPlanPayload(response.planPayload);
        setPatch(response.patch);
        publishAuditEvent({
          actor: 'Console MCP',
          action: 'config.reload.plan',
          target: trimmedTarget,
          description: response.message,
          metadata: {
            planId: response.planId,
            artifactType: artifactId,
            parameters: parsedParameters ?? null,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Falha ao gerar plano de reload governado.';
        setPlanError(message);
        resetPlanState();
      } finally {
        setPlanLoading(false);
      }
    },
    [artifactId, parameters, publishAuditEvent, resetPlanState, targetPath],
  );

  const handleApply = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!planId || !planPayload) {
        return;
      }

      const trimmedActor = actor.trim();
      const trimmedEmail = actorEmail.trim();
      if (!trimmedActor) {
        setApplyError('Informe o executor responsável pela alteração.');
        return;
      }
      if (!trimmedEmail) {
        setApplyError('Informe o e-mail corporativo do executor.');
        return;
      }

      setApplyLoading(true);
      setApplyError(null);

      try {
        const response: GovernedConfigReloadApplyResponse = await applyGovernedConfigReload({
          planId,
          plan: planPayload,
          patch,
          actor: trimmedActor,
          actorEmail: trimmedEmail,
          commitMessage: commitMessage.trim() || DEFAULT_COMMIT,
        });

        const timestamp = new Date().toISOString();
        const details = [response.message];
        if (response.branch) {
          details.push(`Branch: ${response.branch}`);
        }
        if (response.pullRequest?.url) {
          details.push(`PR: ${response.pullRequest.url}`);
        }
        setSuccessMessage(details.join(' '));
        setHistory((current) => [
          {
            id: planId,
            status: response.status,
            actor: trimmedActor,
            timestamp,
            message: response.message,
            branch: response.branch ?? null,
            pullRequestUrl: response.pullRequest?.url ?? null,
          },
          ...current,
        ]);
        publishAuditEvent({
          actor: trimmedActor,
          action: 'config.reload.apply',
          target: targetPath,
          description: response.message,
          metadata: {
            planId,
            branch: response.branch ?? null,
            baseBranch: response.baseBranch ?? null,
            commitSha: response.commitSha ?? null,
            pullRequest: response.pullRequest ?? null,
            justification: justification.trim() || null,
          },
          timestamp,
        });
        resetPlanState();
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Falha ao aplicar plano governado de reload.';
        setApplyError(message);
      } finally {
        setApplyLoading(false);
      }
    },
    [
      actor,
      actorEmail,
      commitMessage,
      justification,
      patch,
      planId,
      planPayload,
      publishAuditEvent,
      resetPlanState,
      targetPath,
    ],
  );

  return (
    <section className="config-reload" aria-labelledby="config-reload-title">
      <header className="config-reload__header">
        <div>
          <h2 id="config-reload-title">Reload governado de configuração</h2>
          <p>
            Gere planos auditáveis para regenerar artefatos críticos e aplique alterações com registro de branch, PR e
            justificativa operacional.
          </p>
        </div>
        <button type="button" className="config-reload__audit-button" onClick={() => setAuditOpen(true)}>
          Ver auditoria
        </button>
      </header>

      <form className="config-reload__form" onSubmit={handlePlan}>
        <div className="config-reload__field">
          <label htmlFor="config-reload-artifact">Artefato</label>
          <select
            id="config-reload-artifact"
            value={artifactId}
            onChange={(event) => setArtifactId(event.target.value)}
          >
            {SUPPORTED_ARTIFACTS.map((artifact) => (
              <option key={artifact.id} value={artifact.id}>
                {artifact.label}
              </option>
            ))}
          </select>
        </div>
        <div className="config-reload__field">
          <label htmlFor="config-reload-target">Caminho de destino</label>
          <input
            id="config-reload-target"
            type="text"
            value={targetPath}
            onChange={(event) => setTargetPath(event.target.value)}
            placeholder={selectedArtifact.placeholderPath}
          />
        </div>
        <div className="config-reload__field">
          <label htmlFor="config-reload-parameters">Parâmetros (JSON)</label>
          <textarea
            id="config-reload-parameters"
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
            placeholder={selectedArtifact.placeholderParameters ?? '{ }'}
            rows={3}
          />
        </div>
        {planError ? (
          <p className="config-reload__error" role="alert">
            {planError}
          </p>
        ) : null}
        <div className="config-reload__actions">
          <button type="submit" disabled={planLoading}>
            {planLoading ? 'Gerando plano…' : 'Gerar plano'}
          </button>
          <button type="button" className="config-reload__secondary" onClick={resetPlanState}>
            Limpar
          </button>
        </div>
      </form>

      {plan && planId ? (
        <section className="config-reload__review" aria-live="polite">
          <header>
            <h3>Plano gerado</h3>
            <p>
              {plan.summary} (ID: <code>{planId}</code>)
            </p>
          </header>
          <PlanDiffViewer
            diffs={diffItems}
            title="Diffs sugeridos"
            emptyMessage="Nenhuma alteração detectada para o artefato informado."
          />
          <form className="config-reload__apply" onSubmit={handleApply}>
            <div className="config-reload__field">
              <label htmlFor="config-reload-actor">Executor</label>
              <input
                id="config-reload-actor"
                type="text"
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="config-reload__field">
              <label htmlFor="config-reload-email">E-mail corporativo</label>
              <input
                id="config-reload-email"
                type="email"
                value={actorEmail}
                onChange={(event) => setActorEmail(event.target.value)}
                placeholder="operador@example.com"
              />
            </div>
            <div className="config-reload__field">
              <label htmlFor="config-reload-commit">Mensagem do commit</label>
              <input
                id="config-reload-commit"
                type="text"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                placeholder={DEFAULT_COMMIT}
              />
            </div>
            <div className="config-reload__field">
              <label htmlFor="config-reload-justification">Justificativa operacional</label>
              <textarea
                id="config-reload-justification"
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
                placeholder="Descreva o motivo do reload e validações realizadas."
                rows={3}
              />
            </div>
            {applyError ? (
              <p className="config-reload__error" role="alert">
                {applyError}
              </p>
            ) : null}
            <div className="config-reload__actions">
              <button type="submit" disabled={applyLoading}>
                {applyLoading ? 'Aplicando…' : 'Aplicar plano'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {successMessage ? (
        <div className="config-reload__success" role="status">
          {successMessage}
        </div>
      ) : null}

      <section className="config-reload__history" aria-live="polite">
        <h3>Histórico de execuções</h3>
        {history.length === 0 ? (
          <p className="config-reload__empty">Nenhum reload governado executado durante esta sessão.</p>
        ) : (
          <ul>
            {history.map((entry) => (
              <li key={entry.id}>
                <header>
                  <span className="config-reload__status">{entry.status}</span>
                  <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                </header>
                <p>
                  <strong>Executor:</strong> {entry.actor}
                </p>
                <p>{entry.message}</p>
                {entry.branch ? (
                  <p>
                    <strong>Branch:</strong> {entry.branch}
                  </p>
                ) : null}
                {entry.pullRequestUrl ? (
                  <p>
                    <strong>Pull request:</strong>{' '}
                    <a href={entry.pullRequestUrl} target="_blank" rel="noreferrer">
                      {entry.pullRequestUrl}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AuditTrailPanel
        title="Auditoria de reloads governados"
        subtitle="Eventos registrados localmente para esta sessão"
        isOpen={isAuditOpen}
        events={auditEvents}
        onClose={() => setAuditOpen(false)}
        emptyState="Nenhum evento registrado. Gere um plano ou aplique uma alteração para popular a trilha."
      />
    </section>
  );
}
