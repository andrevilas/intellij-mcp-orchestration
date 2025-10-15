import Button from '../components/controls/Button';
import Tooltip from '../components/overlays/Tooltip';

export default function Routing() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">Routing Lab</h1>
          <p className="text-muted mb-0">Simule estratégias what-if e aplique otimizações em múltiplos providers.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Reprocessar cenários
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'play']}>
            Executar simulação
          </Button>
        </div>
      </section>

      <section className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-body d-flex flex-column gap-3">
              <h2 className="h5 mb-0">Parâmetros</h2>
              <form className="d-flex flex-column gap-3">
                <div>
                  <label htmlFor="routing-context" className="form-label fw-semibold">
                    Contexto operacional
                  </label>
                  <select id="routing-context" className="form-select">
                    <option>Prod — Latência prioritária</option>
                    <option>FinOps — Custo prioritário</option>
                    <option>Infra — Alta disponibilidade</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="routing-latency" className="form-label fw-semibold">
                    Limite de latência (ms)
                  </label>
                  <input id="routing-latency" type="number" className="form-control" defaultValue={600} />
                </div>
                <div>
                  <label htmlFor="routing-weight" className="form-label fw-semibold">
                    Peso de custo vs. performance
                  </label>
                  <input id="routing-weight" type="range" className="form-range" defaultValue={60} />
                </div>
                <Tooltip content="Aplica a estratégia selecionada na infraestrutura MCP.">
                  <Button variant="secondary" leadingIcon={['fas', 'cog']}>
                    Preparar rollout
                  </Button>
                </Tooltip>
              </form>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="card h-100 shadow-sm">
            <div className="card-body">
              <h2 className="h5">Resultado simulado</h2>
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                <li>
                  <strong>Economia estimada:</strong> 9,8% vs. baseline
                </li>
                <li>
                  <strong>Latência média:</strong> 452 ms (-11%)
                </li>
                <li>
                  <strong>Failover automático:</strong> 2 providers com fallback ativo
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="d-flex flex-column gap-2">
        <h2 className="h5 mb-0">Estados padrão</h2>
        <div className="alert alert-info mb-0" role="status">
          Aguarde enquanto calculamos novos cenários…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhuma estratégia configurada ainda. Crie uma simulação para começar.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao estimar rotas. Refaça a simulação.
        </div>
      </section>
    </div>
  );
}
