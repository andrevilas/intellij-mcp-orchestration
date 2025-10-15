import Button from '../components/controls/Button';
import DropdownMenu from '../components/overlays/Dropdown';

export default function FinOps() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">FinOps & spend</h1>
          <p className="text-muted mb-0">Monitore custo vs. orçamento, variações por provider e oportunidades de saving.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Atualizar dados
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'download']}>
            Exportar relatório
          </Button>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start align-items-md-center">
            <div>
              <h2 className="h5 mb-1">Spend por provider</h2>
              <p className="text-muted mb-0">Últimos 30 dias com tendência semanal.</p>
            </div>
            <DropdownMenu
              toggleLabel="Período"
              items={[
                { id: '7d', label: '7 dias', icon: ['far', 'circle'] },
                { id: '30d', label: '30 dias', icon: ['fas', 'rotate-right'] },
                { id: '90d', label: '90 dias', icon: ['fas', 'play'] },
              ]}
            />
          </div>
          <div className="bg-body-secondary rounded p-4 text-center">
            <p className="mb-0 text-muted">Placeholder do gráfico de spend (Recharts M3).</p>
          </div>
        </div>
      </section>

      <section className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="h5">Top oportunidades</h2>
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                <li>Trocar Balanced → Economy (Gemini) — economia estimada de 14%</li>
                <li>Aplicar warmup automático em FinOps lane — redução de falhas em 18%</li>
                <li>Consolidar logs em bucket único — menos R$ 2.400/mês</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="h5">Alertas recentes</h2>
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                <li><span className="badge text-bg-warning me-2">Alerta</span> Spend da lane Balanced ↑ 6% nesta semana.</li>
                <li><span className="badge text-bg-success me-2">OK</span> Economia acumulada de 11% no mês.</li>
                <li><span className="badge text-bg-danger me-2">Crítico</span> Anomalia detectada no provider sandbox-local.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="d-flex flex-column gap-2">
        <h2 className="h5 mb-0">Estados padrão</h2>
        <div className="alert alert-info mb-0" role="status">
          Calculando projeções de FinOps…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhum dado financeiro disponível para o período selecionado.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao sincronizar dados de custo. Verifique integrações.
        </div>
      </section>
    </div>
  );
}
