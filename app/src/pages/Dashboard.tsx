import Button from '../components/controls/Button';
import ButtonGroup from '../components/controls/ButtonGroup';
import Pagination from '../components/nav/Pagination';
import DropdownMenu from '../components/overlays/Dropdown';

export default function Dashboard() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">Dashboard operacional</h1>
          <p className="text-muted mb-0">
            KPIs de saúde dos servidores MCP, latência média e eficiência financeira nas últimas 24 horas.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Atualizar métricas
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'plus']}>
            Criar relatório
          </Button>
        </div>
      </section>

      <section className="row g-3">
        <div className="col-12 col-lg-4">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title h5">Latência média</h2>
              <p className="display-6 fw-semibold mb-0">412 ms</p>
              <p className="text-success mt-2 mb-0">-12% vs. última janela</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title h5">Spend diário</h2>
              <p className="display-6 fw-semibold mb-0">R$ 18.420</p>
              <p className="text-warning mt-2 mb-0">+6% vs. meta</p>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-4">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="card-title h5">Taxa de sucesso</h2>
              <p className="display-6 fw-semibold mb-0">97,4%</p>
              <p className="text-muted mt-2 mb-0">+0,4 p.p. na última hora</p>
            </div>
          </div>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start align-items-md-center">
            <div>
              <h2 className="h5 mb-1">Sessões recentes</h2>
              <p className="text-muted mb-0">Monitoramento em tempo real das últimas execuções MCP.</p>
            </div>
            <div className="d-flex gap-2">
              <DropdownMenu
                toggleLabel="Filtrar por status"
                items={[
                  { id: 'all', label: 'Todos', icon: ['far', 'circle'] },
                  { id: 'success', label: 'Sucesso', icon: ['fas', 'play'] },
                  { id: 'warning', label: 'Degradação', icon: ['fas', 'rotate-right'] },
                  { id: 'error', label: 'Erro', icon: ['fas', 'stop'] },
                ]}
              />
              <ButtonGroup
                ariaLabel="Ações em lote"
                actions={[
                  {
                    id: 'start',
                    variant: 'secondary',
                    leadingIcon: ['fas', 'play'],
                    children: 'Start',
                  },
                  {
                    id: 'stop',
                    variant: 'outline',
                    leadingIcon: ['fas', 'stop'],
                    children: 'Stop',
                  },
                  {
                    id: 'restart',
                    variant: 'outline',
                    leadingIcon: ['fas', 'rotate-right'],
                    children: 'Restart',
                  },
                ]}
              />
            </div>
          </div>
          <div className="table-responsive rounded border">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Servidor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latência</th>
                  <th scope="col">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>gpt-4o-balanced</td>
                  <td><span className="badge text-bg-success">Ativo</span></td>
                  <td>384 ms</td>
                  <td>há 2 min</td>
                </tr>
                <tr>
                  <td>sonnet-latam</td>
                  <td><span className="badge text-bg-warning">Degradação</span></td>
                  <td>612 ms</td>
                  <td>há 5 min</td>
                </tr>
                <tr>
                  <td>nexus-finops</td>
                  <td><span className="badge text-bg-danger">Erro</span></td>
                  <td>-</td>
                  <td>há 8 min</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Pagination currentPage={1} totalPages={8} />
        </div>
      </section>

      <section className="d-flex flex-column gap-2">
        <h2 className="h5 mb-0">Estados padrão</h2>
        <div className="alert alert-info mb-0" role="status">
          Carregando dados do dashboard…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhum dado disponível para o período selecionado.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao carregar métricas. Tente novamente em instantes.
        </div>
      </section>
    </div>
  );
}
