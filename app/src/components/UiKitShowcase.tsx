import { FormEvent, useMemo, useState } from 'react';

import Button from './actions/Button';
import ButtonGroup from './actions/ButtonGroup';
import Dropdown from './menus/Dropdown';
import Tooltip from './menus/Tooltip';
import Alert from './feedback/Alert';
import { useToast } from './feedback/ToastProvider';
import ConfirmationModal from './modals/ConfirmationModal';
import FormModal from './modals/FormModal';
import KpiCard, { type KpiCardStatus } from './KpiCard';
import ResourceTable, { type ResourceTableColumn } from './ResourceTable';
import ResourceDetailCard, { type ResourceDetailStatus } from './ResourceDetailCard';
import StatusBadge from './indicators/StatusBadge';
import ProgressIndicator from './indicators/ProgressIndicator';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import '../icons/ui-kit';
import {
  FileDownloadControl,
  FileUploadControl,
  FormErrorSummary,
  Input,
  InputGroup,
  Select,
  Switch as SwitchControl,
  TextArea,
} from './forms';
import { McpFormProvider, useMcpField, useMcpForm, useMcpFormContext } from '../hooks/useMcpForm';
import { describeFixtureRequest } from '../utils/fixtureStatus';

import telemetryMetricsFixture from '#fixtures/telemetry_metrics.json';
import serversFixture from '#fixtures/servers.json';
import serverHealthFixture from '#fixtures/server_health.json';

import './ui-kit-showcase.scss';

const DOC_BASE_URL =
  (import.meta.env.VITE_DOCS_BASE_URL as string | undefined) ??
  'https://github.com/intellij-mcp-orchestration/intellij-mcp-orchestration/blob/main';

interface UsageSnippetProps {
  title: string;
  description: string;
  code: string;
  docs?: Array<{ label: string; href: string }>;
}

function UsageSnippet({ title, description, code, docs }: UsageSnippetProps): JSX.Element {
  return (
    <article className="ui-kit-showcase__snippet" aria-label={title}>
      <header className="ui-kit-showcase__snippet-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {docs != null && docs.length > 0 ? (
          <ul className="ui-kit-showcase__links">
            {docs.map((doc) => (
              <li key={doc.href}>
                <a href={doc.href} target="_blank" rel="noreferrer">
                  {doc.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </header>
      <pre>
        <code>{code}</code>
      </pre>
    </article>
  );
}

type ScenarioState = 'success' | 'loading' | 'empty' | 'error';

interface FormDemoValues {
  serviceName: string;
  environment: '' | 'development' | 'staging' | 'production';
  description: string;
  alerts: boolean;
  gateway: string;
}

const FORM_DEFAULT_VALUES: FormDemoValues = {
  serviceName: '',
  environment: 'staging',
  description: '',
  alerts: true,
  gateway: 'https://mcp.internal.gateway',
};

interface TelemetryMetricsFixture {
  total_runs: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  success_rate: number;
  end: string;
}

interface ServerFixture {
  id: string;
  name: string;
  description: string;
  tags: string[];
  capabilities: string[];
  transport: string;
  updated_at: string;
}

interface HealthCheckFixture {
  status: string;
  checked_at: string;
  latency_ms: number;
  message: string;
}

const telemetryMetrics = telemetryMetricsFixture as TelemetryMetricsFixture;
const serversData = (serversFixture as { servers: ServerFixture[] }).servers;
const healthChecks = (serverHealthFixture as { checks: Record<string, HealthCheckFixture[]> }).checks;

const snippetEntries: Array<UsageSnippetProps & { id: string }> = [
  {
    id: 'tokens',
    title: 'Tokens MCP Light/Dark',
    description:
      'Declare variáveis globais e sincronize com o `ThemeSwitch` para respeitar contraste AA/AAA.',
    code: `:root {\n  --mcp-interactive: #3730a3;\n  --mcp-text-inverse: #e2e8f0;\n}\n\n[data-theme='dark'] {\n  --mcp-interactive: #a5b4fc;\n  --mcp-text-inverse: #0b1120;\n}`,
    docs: [
      { label: 'Audit UI M1–M6', href: `${DOC_BASE_URL}/docs/audit-ui-m1-m6.md` },
    ],
  },
  {
    id: 'actions',
    title: 'Ações com ToastProvider',
    description:
      'Envie feedback consistente encapsulando a UI em `ToastProvider` e disparando toasts via hook.',
    code: `const { pushToast } = useToast();\n\n<Button\n  variant="primary"\n  icon={<FontAwesomeIcon icon="shield-halved" />}\n  onClick={() => pushToast({ title: 'Provisionado', variant: 'success' })}\n>\n  Provisionar\n</Button>;`,
    docs: [
      { label: 'Forms & Feedback', href: `${DOC_BASE_URL}/docs/forms/README.md` },
    ],
  },
  {
    id: 'forms',
    title: 'Form Controls MCP',
    description:
      'Combine `useMcpForm` com campos controlados para validação acessível e estados consistentes.',
    code: `const form = useMcpForm<FormDemoValues>({ defaultValues });\n\n<McpFormProvider {...form}>\n  <InputGroup name="serviceName" label="Serviço" leftIcon="globe" />\n  <SwitchControl name="alerts" label="Ativar alertas" />\n</McpFormProvider>;`,
    docs: [
      { label: 'UI Roadmap', href: `${DOC_BASE_URL}/docs/archive/ui-next-steps.md` },
    ],
  },
  {
    id: 'agents-wizard',
    title: 'Wizard Governado de Agents',
    description:
      'Use `McpFormProvider`, `FormErrorSummary` e `describeFixtureRequest` para alinhar estados `loading/empty/error/success` aos mocks do catálogo MCP.',
    code: `const form = useMcpForm<PlanFormValues>({ defaultValues });\nconst { register, handleSubmit } = form;\n\n<McpFormProvider {...form}>\n  <form onSubmit={handleSubmit(onSubmit)}>\n    <FormErrorSummary />\n    <Input label="Identificador" {...register('slug', { required: 'Informe o identificador.' })} />\n    <fieldset data-status={status} aria-describedby={statusId}>\n      {status === 'loading' && <p>{request.loading}</p>}\n      {status === 'error' && <Alert variant="error" title={request.error} />}\n      {status === 'empty' && <p>Nenhum servidor MCP cadastrado.</p>}\n    </fieldset>\n  </form>\n</McpFormProvider>;`,
    docs: [
      {
        label: 'Fixture de plano governado',
        href: `${DOC_BASE_URL}/tests/fixtures/backend/data/agent_governed_plan.json`,
      },
      { label: 'Handlers MSW', href: `${DOC_BASE_URL}/app/src/mocks/handlers.ts` },
    ],
  },
];

export default function UiKitShowcase(): JSX.Element {
  const { pushToast } = useToast();
  const [isConfirmationOpen, setConfirmationOpen] = useState(false);
  const [isFormOpen, setFormOpen] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);
  const [workflowName, setWorkflowName] = useState('Rotina semanal');
  const [isSubmitting, setSubmitting] = useState(false);
  const [kpiScenario, setKpiScenario] = useState<ScenarioState>('success');
  const [tableScenario, setTableScenario] = useState<ScenarioState>('success');
  const [detailScenario, setDetailScenario] = useState<ScenarioState>('success');
  const formMethods = useMcpForm<FormDemoValues>({ defaultValues: { ...FORM_DEFAULT_VALUES } });
  const [lastFormSubmission, setLastFormSubmission] = useState<string | null>(null);

  const telemetryRequestMessages = useMemo(() => describeFixtureRequest('telemetria de custo'), []);
  const telemetryLoadingMessage = telemetryRequestMessages.loading;
  const telemetryErrorMessage = telemetryRequestMessages.error;

  const serverRequestMessages = useMemo(
    () =>
      describeFixtureRequest('informações dos servidores MCP', {
        action: 'Sincronizando',
        errorPrefix: 'sincronizar',
      }),
    [],
  );
  const serverLoadingMessage = serverRequestMessages.loading;
  const serverErrorMessage = serverRequestMessages.error;

  const dropdownOptions = useMemo(
    () => [
      {
        id: 'toast-success',
        label: 'Toast de sucesso',
        description: 'Mostra notificação persistente',
        icon: <FontAwesomeIcon icon="download" fixedWidth aria-hidden="true" />,
        onSelect: () =>
          pushToast({
            title: 'Provisionamento concluído',
            description: 'O servidor foi promovido para produção.',
            variant: 'success',
          }),
      },
      {
        id: 'open-confirmation',
        label: 'Abrir confirmação',
        description: 'Solicita aprovação explícita',
        icon: <FontAwesomeIcon icon="share-nodes" fixedWidth aria-hidden="true" />,
        onSelect: () => setConfirmationOpen(true),
      },
      {
        id: 'open-form',
        label: 'Abrir formulário',
        description: 'Edita parâmetros críticos',
        icon: <FontAwesomeIcon icon="pen-to-square" fixedWidth aria-hidden="true" />,
        onSelect: () => setFormOpen(true),
      },
    ],
    [pushToast],
  );

  const toolbarActions = useMemo(
    () => [
      {
        id: 'run',
        icon: <FontAwesomeIcon icon="play" fixedWidth aria-hidden="true" />,
        label: 'Executar blueprint',
        variant: 'primary' as const,
        onClick: () =>
          pushToast({
            title: 'Execução iniciada',
            description: 'O blueprint foi enviado para o orquestrador.',
            variant: 'info',
          }),
      },
      {
        id: 'restart',
        icon: <FontAwesomeIcon icon="rotate-right" fixedWidth aria-hidden="true" />,
        label: 'Reexecutar última etapa',
        variant: 'secondary' as const,
        onClick: () =>
          pushToast({
            title: 'Reprocessamento agendado',
            description: 'A etapa será repetida com rollback seguro.',
            variant: 'success',
          }),
      },
      {
        id: 'stop',
        icon: <FontAwesomeIcon icon="circle-stop" fixedWidth aria-hidden="true" />,
        label: 'Cancelar',
        variant: 'danger' as const,
        onClick: () =>
          pushToast({
            title: 'Execução cancelada',
            description: 'Nenhuma alteração adicional será aplicada.',
            variant: 'warning',
          }),
      },
    ],
    [pushToast],
  );

  const scenarioOptions: Array<{ id: ScenarioState; label: string }> = [
    { id: 'success', label: 'Dados' },
    { id: 'loading', label: 'Carregando' },
    { id: 'empty', label: 'Vazio' },
    { id: 'error', label: 'Erro' },
  ];

  const scenarioToStatus = {
    success: 'default',
    loading: 'loading',
    empty: 'empty',
    error: 'error',
  } as const;

  const displayedServers = useMemo(() => serversData.slice(0, 5), []);

  const serverColumns = useMemo<ResourceTableColumn<ServerFixture>[]>(
    () => [
      {
        id: 'name',
        header: 'Servidor',
        sortable: true,
        sortAccessor: (server) => server.name,
        render: (server) => (
          <div className="ui-kit-showcase__resource">
            <strong>{server.name}</strong>
            <span className="ui-kit-showcase__muted">{server.description}</span>
          </div>
        ),
      },
      {
        id: 'transport',
        header: 'Transporte',
        sortable: true,
        sortAccessor: (server) => server.transport,
        align: 'center',
        render: (server) => (
          <StatusBadge tone="info" appearance="outline">
            {server.transport}
          </StatusBadge>
        ),
        width: '140px',
      },
      {
        id: 'capabilities',
        header: 'Capacidades',
        render: (server) => (
          <div className="ui-kit-showcase__badge-group">
            {server.capabilities.map((capability) => (
              <StatusBadge key={capability} tone="success" appearance="soft">
                {capability}
              </StatusBadge>
            ))}
          </div>
        ),
      },
      {
        id: 'updated',
        header: 'Atualizado',
        sortable: true,
        sortAccessor: (server) => new Date(server.updated_at),
        align: 'right',
        width: '160px',
        render: (server) =>
          new Intl.DateTimeFormat('pt-BR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(server.updated_at)),
      },
    ],
    [],
  );

  const kpiStatus = scenarioToStatus[kpiScenario] as KpiCardStatus;
  const detailStatus = scenarioToStatus[detailScenario] as ResourceDetailStatus;

  const successRatePercentage = telemetryMetrics.success_rate * 100;
  const formattedSuccessRate = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(successRatePercentage);
  const formattedRuns = telemetryMetrics.total_runs.toLocaleString('pt-BR');
  const formattedCost = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
  }).format(telemetryMetrics.total_cost_usd);
  const formattedLatency = Math.round(telemetryMetrics.avg_latency_ms);
  const lastSync = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(telemetryMetrics.end));
  const tokensRatio =
    telemetryMetrics.total_tokens_in > 0
      ? Math.min(
          100,
          Math.round((telemetryMetrics.total_tokens_out / telemetryMetrics.total_tokens_in) * 100),
        )
      : 0;

  const tableItems =
    tableScenario === 'success' || tableScenario === 'loading' ? displayedServers : [];
  const tableError = tableScenario === 'error' ? serverErrorMessage : null;
  const tableIsLoading = tableScenario === 'loading';

  const geminiChecks = healthChecks.gemini ?? [];
  const latestCheck = geminiChecks[0];
  const averageLatency =
    geminiChecks.length > 0
      ? Math.round(geminiChecks.reduce((sum, check) => sum + check.latency_ms, 0) / geminiChecks.length)
      : null;

  const detailItems = [
    {
      id: 'status',
      label: 'Status',
      value: (
        <StatusBadge
          tone={latestCheck?.status === 'healthy' ? 'success' : 'warning'}
          appearance="solid"
        >
          {latestCheck?.status === 'healthy' ? 'Saudável' : 'Verificar'}
        </StatusBadge>
      ),
      hint:
        latestCheck != null
          ? `Último check às ${new Intl.DateTimeFormat('pt-BR', {
              timeStyle: 'short',
            }).format(new Date(latestCheck.checked_at))}`
          : 'Sem verificações recentes',
      icon: <FontAwesomeIcon icon="gauge-high" fixedWidth aria-hidden="true" />,
    },
    {
      id: 'latency',
      label: 'Latência média',
      value: averageLatency != null ? `${averageLatency} ms` : 'N/D',
      hint: averageLatency != null ? 'Média das últimas verificações (server_health.json)' : undefined,
      icon: <FontAwesomeIcon icon="satellite-dish" fixedWidth aria-hidden="true" />,
    },
    {
      id: 'tokens',
      label: 'Tokens consumidos',
      value: `${telemetryMetrics.total_tokens_out.toLocaleString('pt-BR')} saída`,
      hint: `${telemetryMetrics.total_tokens_in.toLocaleString('pt-BR')} entrada`,
      icon: <FontAwesomeIcon icon="shuffle" fixedWidth aria-hidden="true" />,
    },
    {
      id: 'cost',
      label: 'Custo semanal',
      value: formattedCost,
      hint: 'Fixture telemetry_metrics.json',
      icon: <FontAwesomeIcon icon="store" fixedWidth aria-hidden="true" />,
    },
  ];

  const detailEmptyState = {
    title: 'Selecione um servidor',
    description: 'Escolha uma linha na tabela para visualizar latência e custos simulados.',
    action: (
      <Button size="sm" variant="secondary" onClick={() => setTableScenario('success')}>
        Ver tabela
      </Button>
    ),
    illustration: <FontAwesomeIcon icon="diagram-project" fixedWidth aria-hidden="true" />,
  };

  function handleWorkflowSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const name = String(data.get('workflow-name') ?? 'Workflow');
    window.setTimeout(() => {
      setSubmitting(false);
      setFormOpen(false);
      pushToast({
        title: 'Fluxo atualizado',
        description: `${name} salvo com sucesso.`,
        variant: 'info',
      });
    }, 300);
  }

  function handleKpiRetry(): void {
    setKpiScenario('loading');
    window.setTimeout(() => setKpiScenario('success'), 600);
  }

  function handleTableRetry(): void {
    setTableScenario('loading');
    window.setTimeout(() => setTableScenario('success'), 650);
  }

  function handleDetailRetry(): void {
    setDetailScenario('loading');
    window.setTimeout(() => setDetailScenario('success'), 650);
  }

  function handleFormSuccess(values: FormDemoValues): void {
    setLastFormSubmission(new Date().toISOString());
    pushToast({
      title: 'Formulário enviado',
      description: `Configuração de ${values.serviceName || 'serviço'} salva com sucesso.`,
      variant: 'success',
    });
  }

  return (
    <section className="ui-kit-showcase" data-testid="ui-kit-showcase" aria-label="UI Kit">
      <header className="ui-kit-showcase__header">
        <h2>UI Kit</h2>
        <p>
          Componentes reutilizáveis com tokens MCP. Use o dropdown para explorar ações ou abra os modais para validar acessibilidade.
        </p>
      </header>

      <div className="ui-kit-showcase__snippets" aria-label="Snippets de uso">
        {snippetEntries.map((snippet) => (
          <UsageSnippet key={snippet.id} {...snippet} />
        ))}
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Botões</span>
        <div className="ui-kit-showcase__row">
          <Button variant="primary">Primário</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="danger">Crítico</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="link">Link</Button>
          <Button variant="primary" loading>
            Sincronizando
          </Button>
          <Button
            variant="secondary"
            disabled
            icon={<FontAwesomeIcon icon="shield-halved" fixedWidth aria-hidden="true" />}
          >
            Protegido
          </Button>
        </div>
        <p className="ui-kit-showcase__note">
          Variantes utilizam tokens dedicados (<code>--mcp-action-*</code>) para luz e tema escuro; estados de
          <strong> loading</strong> e <strong>disabled</strong> preservam foco acessível.
        </p>
        <div className="ui-kit-showcase__toolbar" role="presentation">
          <ButtonGroup segmented label="Rotinas de execução">
            {toolbarActions.map((action) => (
              <Tooltip key={action.id} content={action.label} placement="bottom">
                <Button
                  aria-label={action.label}
                  variant={action.variant ?? 'secondary'}
                  icon={action.icon}
                  onClick={action.onClick}
                />
              </Tooltip>
            ))}
          </ButtonGroup>
        </div>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Menus</span>
        <div className="ui-kit-showcase__row">
          <Dropdown label="Ações rápidas" options={dropdownOptions} />
          <Tooltip content="Executa fluxo automatizado" placement="bottom" delay={{ open: 160, close: 90 }}>
            <Button variant="outline">Detalhes</Button>
          </Tooltip>
        </div>
        <p className="ui-kit-showcase__note">
          Dropdowns e tooltips compartilham tokens de overlay (<code>--mcp-z-dropdown</code> &lt; <code>--mcp-z-tooltip</code>)
          e prendem foco via teclado, com fechamento via <kbd>ESC</kbd> e delays configuráveis.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Formulários</span>
        <div className="ui-kit-showcase__column ui-kit-showcase__column--wide">
          <McpFormProvider {...formMethods}>
            <FormControlsSection
              lastSubmission={lastFormSubmission}
              onSuccess={(values) => {
                handleFormSuccess(values);
                formMethods.reset({ ...FORM_DEFAULT_VALUES });
              }}
            />
          </McpFormProvider>
          <div className="ui-kit-showcase__row ui-kit-showcase__row--wrap ui-kit-showcase__row--stretch">
            <FileUploadControl
              maxSizeBytes={8 * 1024 * 1024}
              onUpload={async (_file, update) => {
                update(35);
                await new Promise((resolve) => window.setTimeout(resolve, 420));
                update(68);
                await new Promise((resolve) => window.setTimeout(resolve, 360));
              }}
              onComplete={(file) =>
                pushToast({
                  title: 'Upload registrado',
                  description: `${file.name} pronto para comparação com os agentes.`,
                  variant: 'info',
                })
              }
            />
            <FileDownloadControl
              onDownload={async (update) => {
                update(25);
                await new Promise((resolve) => window.setTimeout(resolve, 310));
                update(78);
                await new Promise((resolve) => window.setTimeout(resolve, 340));
                return new Blob([
                  JSON.stringify(
                    {
                      generatedAt: new Date().toISOString(),
                      environments: ['development', 'staging', 'production'],
                    },
                    null,
                    2,
                  ),
                ], {
                  type: 'application/json',
                });
              }}
            />
          </div>
        </div>
        <p className="ui-kit-showcase__note">
          Controles aplicam tokens <code>--mcp-form-*</code>, propagam <code>aria-invalid</code> via <code>react-hook-form</code>{' '}
          e exibem resumo de erros integrado ao <code>Alert</code>.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Indicadores</span>
        <div className="ui-kit-showcase__toolbar" role="presentation">
          <ButtonGroup segmented label="Estado do KPI">
            {scenarioOptions.map((option) => (
              <Button
                key={`kpi-${option.id}`}
                size="sm"
                variant={kpiScenario === option.id ? 'primary' : 'secondary'}
                aria-pressed={kpiScenario === option.id}
                onClick={() => setKpiScenario(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <div className="ui-kit-showcase__kpi-grid">
          <KpiCard
            label="Custo semanal"
            value={formattedCost}
            caption={`Executou ${formattedRuns} rotinas com ${formattedLatency} ms de latência média.`}
            trend={telemetryMetrics.success_rate >= 0.95 ? 'up' : 'flat'}
            trendLabel={`${formattedSuccessRate}% de sucesso`}
            icon={<FontAwesomeIcon icon="gauge-high" fixedWidth aria-hidden="true" />}
            status={kpiStatus}
            statusMessages={{
              loading: telemetryLoadingMessage,
              empty: 'Fixture sem movimentação nesta sprint.',
              error: telemetryErrorMessage,
            }}
            action={
              kpiStatus === 'empty' ? (
                <Button size="sm" variant="outline" onClick={() => setKpiScenario('success')}>
                  Recarregar fixture
                </Button>
              ) : null
            }
            onRetry={kpiStatus === 'error' ? handleKpiRetry : undefined}
            footer={`Sincronizado em ${lastSync}`}
          />
          <div className="ui-kit-showcase__column">
            <div className="ui-kit-showcase__row ui-kit-showcase__row--wrap">
              <StatusBadge tone="success" appearance="solid">
                Saúde estável
              </StatusBadge>
              <StatusBadge tone="info">Observabilidade ativa</StatusBadge>
              <StatusBadge tone="warning" appearance="outline">
                Latência em alerta
              </StatusBadge>
              <StatusBadge tone="danger" appearance="soft">
                Fila degradada
              </StatusBadge>
            </div>
          <ProgressIndicator
            label="Taxa de sucesso"
            value={Math.round(successRatePercentage)}
            description="Dados de tests/fixtures/backend/data/telemetry_metrics.json"
            tone="success"
            status={kpiStatus}
            statusMessages={{
              loading: telemetryLoadingMessage,
              empty: 'Sem execuções registradas nesta janela.',
              error: telemetryErrorMessage,
            }}
            action={
              kpiStatus === 'error' ? (
                <Button size="sm" variant="outline" onClick={handleKpiRetry}>
                  Recarregar indicador
                </Button>
              ) : undefined
            }
          />
          <ProgressIndicator
            label="Tokens de saída"
            value={tokensRatio}
            description={`${telemetryMetrics.total_tokens_out.toLocaleString('pt-BR')} tokens emitidos nesta sprint.`}
            tone={tokensRatio > 80 ? 'warning' : 'info'}
            status={kpiStatus}
            statusMessages={{
              loading: telemetryLoadingMessage,
              empty: 'Aguardando emissões para calcular a taxa.',
              error: telemetryErrorMessage,
            }}
          />
        </div>
        </div>
        <p className="ui-kit-showcase__note">
          KPIs e badges utilizam tokens MCP para manter contraste em ambos os temas, reaproveitando{' '}
          <code>describeFixtureRequest</code> para exibir mensagens de <code>loading</code> e <code>error</code> iguais às telas
          reais, além de cobrir CTA acessível.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Listas e tabelas</span>
        <div className="ui-kit-showcase__toolbar" role="presentation">
          <ButtonGroup segmented label="Estado da tabela">
            {scenarioOptions.map((option) => (
              <Button
                key={`table-${option.id}`}
                size="sm"
                variant={tableScenario === option.id ? 'primary' : 'secondary'}
                aria-pressed={tableScenario === option.id}
                onClick={() => setTableScenario(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <ResourceTable
          title="Servidores registrados"
          description="Dados demonstrativos carregados de tests/fixtures/backend/data/servers.json."
          ariaLabel="Tabela de servidores MCP com ordenação, foco e estados de carregamento"
          items={tableItems}
          columns={serverColumns}
          getRowId={(server) => server.id}
          renderActions={
            tableItems.length > 0
              ? (server) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      pushToast({
                        title: 'Detalhes do servidor',
                        description: `Abrindo ${server.name} para inspeção.`,
                        variant: 'info',
                      })
                    }
                  >
                    Abrir
                  </Button>
                )
              : undefined
          }
          toolbar={
            <StatusBadge tone="info" appearance="outline">
              {displayedServers.length} conectados
            </StatusBadge>
          }
          isLoading={tableIsLoading}
          error={tableError}
          emptyState={{
            title: 'Nenhum servidor provisionado',
            description: 'Utilize o CTA para registrar o primeiro workspace MCP da squad.',
            action: (
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  pushToast({
                    title: 'Provisionamento simulado',
                    description: 'Fluxo fictício disparado com fixtures.',
                    variant: 'success',
                  })
                }
              >
                Registrar servidor
              </Button>
            ),
            illustration: <FontAwesomeIcon icon="server" fixedWidth aria-hidden="true" />,
          }}
          statusMessages={{
            loading: serverLoadingMessage,
            empty: 'Nenhum servidor provisionado no momento.',
            error: serverErrorMessage,
          }}
          onRetry={tableError ? handleTableRetry : undefined}
          defaultSort={{ columnId: 'name' }}
          onSortChange={({ columnId, direction }) =>
            pushToast({
              title: 'Ordenação aplicada',
              description: `Coluna ${columnId} em ordem ${direction === 'asc' ? 'crescente' : 'decrescente'}.`,
              variant: 'info',
            })
          }
          onRowClick={
            tableItems.length > 0
              ? (server) => {
                  setDetailScenario('success');
                  pushToast({
                    title: server.name,
                    description: `Transporte ${server.transport} com ${server.capabilities.length} capacidades.`,
                    variant: 'info',
                  });
                }
              : undefined
          }
          getRowAriaLabel={(server) => `Servidor ${server.name}`}
          getRowDescription={(server) =>
            `Transporte ${server.transport} com capacidades ${server.capabilities.join(', ')}`
          }
          filters={
            <div className="ui-kit-showcase__filters">
              <label className="ui-kit-showcase__field">
                <span>Buscar</span>
                <input type="search" placeholder="Filtrar por nome" />
              </label>
              <label className="ui-kit-showcase__field">
                <span>Transporte</span>
                <select defaultValue="all">
                  <option value="all">Todos</option>
                  <option value="stdio">STDIO</option>
                  <option value="sse">SSE</option>
                </select>
              </label>
            </div>
          }
        />
        <p className="ui-kit-showcase__note">
          A tabela utiliza <code>aria-describedby</code>, foco visível em linhas clicáveis, ordenação com feedback discreto e
          mensagens de <code>loading</code>/<code>error</code> derivadas de{' '}
          <code>describeFixtureRequest</code>.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Detalhes</span>
        <div className="ui-kit-showcase__toolbar" role="presentation">
          <ButtonGroup segmented label="Estado do detalhe">
            {scenarioOptions.map((option) => (
              <Button
                key={`detail-${option.id}`}
                size="sm"
                variant={detailScenario === option.id ? 'primary' : 'secondary'}
                aria-pressed={detailScenario === option.id}
                onClick={() => setDetailScenario(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <ResourceDetailCard
          title="Gemini MCP"
          description="Resumo de health-check carregado de tests/fixtures/backend/data/server_health.json."
          ariaLabel="Detalhes do servidor Gemini"
          items={detailItems}
          status={detailStatus}
          statusMessages={{
            loading: serverLoadingMessage,
            empty: 'Selecione um servidor para visualizar métricas simuladas.',
            error: serverErrorMessage,
          }}
          emptyState={detailEmptyState}
          onRetry={detailScenario === 'error' ? handleDetailRetry : undefined}
          actions={
            detailStatus === 'default' ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  pushToast({
                    title: 'Health-check reenviado',
                    description: 'Execução simulada com dados determinísticos.',
                    variant: 'success',
                  })
                }
              >
                Reexecutar health-check
              </Button>
            ) : null
          }
          footer="Sincronizado em tempo real via fixtures compartilhadas."
        />
        <p className="ui-kit-showcase__note">
          Cartões de detalhe compartilham tokens MCP, reaproveitam{' '}
          <code>describeFixtureRequest</code> para mensagens de status e mantêm CTA acessível para cenários de QA.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Feedback</span>
        <div className="ui-kit-showcase__column">
          {alertVisible ? (
            <Alert
              title="Execução em andamento"
              description="O runbook noturno está sendo executado com 3 etapas restantes."
              action={
                <Button size="sm" variant="outline" onClick={() => setAlertVisible(false)}>
                  Dispensar
                </Button>
              }
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAlertVisible(true)}>
              Reexibir alerta
            </Button>
          )}
        </div>
        <p className="ui-kit-showcase__note">
          Toasts respeitam <code>--mcp-z-toast</code>, anunciam via <code>aria-live</code> e herdam o tema atual para contraste.
        </p>
      </div>

      <div className="ui-kit-showcase__group">
        <span className="ui-kit-showcase__label">Modais</span>
        <div className="ui-kit-showcase__row">
          <Button variant="secondary" onClick={() => setConfirmationOpen(true)}>
            Abrir confirmação
          </Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            Abrir formulário
          </Button>
        </div>
        <p className="ui-kit-showcase__note">
          Overlays utilizam <code>--mcp-z-modal</code> &gt; <code>--mcp-z-toast</code> e os modais mantêm trap de foco com
          confirmação em dois cliques.
        </p>
      </div>

      <ConfirmationModal
        isOpen={isConfirmationOpen}
        title="Excluir instância"
        description="Esta ação removerá logs associados e não poderá ser desfeita."
        onConfirm={() => {
          setConfirmationOpen(false);
          pushToast({
            title: 'Instância removida',
            description: 'Os recursos associados foram desalocados.',
            variant: 'warning',
          });
        }}
        onCancel={() => setConfirmationOpen(false)}
      />

      <FormModal
        isOpen={isFormOpen}
        title="Editar workflow"
        description="Atualize as janelas de execução e metas de SLO."
        onSubmit={handleWorkflowSubmit}
        onCancel={() => setFormOpen(false)}
        isSubmitting={isSubmitting}
      >
        <label className="ui-kit-showcase__field">
          <span>Nome</span>
          <input
            type="text"
            name="workflow-name"
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            required
            data-autofocus="true"
          />
        </label>
        <label className="ui-kit-showcase__field">
          <span>Janela</span>
          <select name="workflow-window" defaultValue="semanal">
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
          </select>
        </label>
      </FormModal>
    </section>
  );
}

interface FormControlsSectionProps {
  onSuccess: (values: FormDemoValues) => void;
  lastSubmission: string | null;
}

function FormControlsSection({ onSuccess, lastSubmission }: FormControlsSectionProps): JSX.Element {
  const { handleSubmit, reset, formState } = useMcpFormContext<FormDemoValues>();
  const serviceName = useMcpField<FormDemoValues>('serviceName', {
    rules: { required: 'Informe o nome do serviço.' },
  });
  const environment = useMcpField<FormDemoValues>('environment', {
    rules: { required: 'Selecione o ambiente de destino.' },
  });
  const descriptionField = useMcpField<FormDemoValues>('description', {
    rules: {
      required: 'Descreva o objetivo do fluxo.',
      minLength: { value: 20, message: 'Descreva com pelo menos 20 caracteres.' },
    },
  });
  const alertsField = useMcpField<FormDemoValues>('alerts');
  const gatewayField = useMcpField<FormDemoValues>('gateway', {
    rules: {
      required: 'Informe o endpoint do gateway.',
      pattern: {
        value: /^https?:\/\//i,
        message: 'Informe uma URL iniciando com http:// ou https://.',
      },
    },
  });

  const submit = handleSubmit((values) => {
    onSuccess(values);
  });

  const lastSubmissionLabel = lastSubmission
    ? `Último envio em ${new Date(lastSubmission).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Preencha os campos para testar validações e o resumo de erros.';

  return (
    <form className="ui-kit-showcase__form" onSubmit={submit} data-testid="form-controls-demo" noValidate>
      <FormErrorSummary />
      <Input
        {...serviceName.inputProps}
        label="Nome do serviço"
        placeholder="Ex.: mcp-orchestrator"
        helperText="Use letras minúsculas e hífens para evitar conflitos."
        required
        autoComplete="off"
        error={serviceName.error}
      />
      <Select
        {...environment.inputProps}
        label="Ambiente"
        helperText="Tokens de foco e erro são propagados automaticamente."
        required
        error={environment.error}
      >
        <option value="">Selecione…</option>
        <option value="development">Desenvolvimento</option>
        <option value="staging">Staging</option>
        <option value="production">Produção</option>
      </Select>
      <TextArea
        {...descriptionField.inputProps}
        label="Descrição"
        placeholder="Inclua objetivo, owners e janelas de execução."
        helperText="Validação exige mínimo de 20 caracteres."
        required
        rows={4}
        error={descriptionField.error}
      />
      <SwitchControl
        {...alertsField.inputProps}
        label="Ativar alertas proativos"
        description="Receba toasts quando a latência exceder 20% do baseline."
        error={alertsField.error}
      />
      <InputGroup
        {...gatewayField.inputProps}
        label="Gateway de provisionamento"
        placeholder="https://"
        helperText="Exemplo: https://mcp.internal.gateway"
        leftIcon="globe"
        rightIcon="lock"
        required
        error={gatewayField.error}
      />
      <p className="mcp-form-helper" aria-live="polite">
        {lastSubmissionLabel}
      </p>
      <div className="mcp-form-actions">
        <Button type="button" variant="outline" onClick={() => reset({ ...FORM_DEFAULT_VALUES })}>
          Limpar
        </Button>
        <Button type="submit" variant="primary" loading={formState.isSubmitting}>
          Salvar formulário
        </Button>
      </div>
    </form>
  );
}
