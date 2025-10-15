import Button from '../components/controls/Button';
import DropdownMenu from '../components/overlays/Dropdown';
import Tooltip from '../components/overlays/Tooltip';

const policies = [
  { name: 'Balanced rollout', status: 'Ativa', updatedAt: 'há 2 horas', targets: 12 },
  { name: 'Turbo fallback', status: 'Rascunho', updatedAt: 'há 1 dia', targets: 5 },
  { name: 'Economy lane', status: 'Ativa', updatedAt: 'há 3 dias', targets: 18 },
];

export default function Policies() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">Policies & guardrails</h1>
          <p className="text-muted mb-0">Orquestre templates, aplique rollouts e audite histórico de versões.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Sincronizar templates
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'plus']}>
            Nova policy
          </Button>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start align-items-md-center">
            <div>
              <h2 className="h5 mb-1">Templates disponíveis</h2>
              <p className="text-muted mb-0">Status do rollout e número de targets por template.</p>
            </div>
            <DropdownMenu
              toggleLabel="Filtrar"
              items={[
                { id: 'all', label: 'Todas', icon: ['far', 'circle'] },
                { id: 'active', label: 'Ativas', icon: ['fas', 'play'] },
                { id: 'draft', label: 'Rascunhos', icon: ['fas', 'pen'] },
              ]}
            />
          </div>
          <div className="table-responsive rounded border">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Policy</th>
                  <th scope="col">Status</th>
                  <th scope="col">Targets</th>
                  <th scope="col">Atualização</th>
                  <th scope="col" className="text-end">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.name}>
                    <th scope="row">{policy.name}</th>
                    <td>
                      {policy.status === 'Ativa' && <span className="badge text-bg-success">Ativa</span>}
                      {policy.status === 'Rascunho' && <span className="badge text-bg-secondary">Rascunho</span>}
                    </td>
                    <td>{policy.targets}</td>
                    <td>{policy.updatedAt}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <Tooltip content="Ver histórico">
                          <Button variant="outline" leadingIcon={['fas', 'magnifying-glass']} />
                        </Tooltip>
                        <Tooltip content="Publicar">
                          <Button variant="outline" leadingIcon={['fas', 'play']} />
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="d-flex flex-column gap-2">
        <h2 className="h5 mb-0">Estados padrão</h2>
        <div className="alert alert-info mb-0" role="status">
          Carregando templates e destinos…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhuma policy cadastrada. Inicie pelo template Balanced.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao aplicar rollout. Confira conflitos de targets.
        </div>
      </section>
    </div>
  );
}
