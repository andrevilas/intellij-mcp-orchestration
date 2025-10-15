import Button from '../components/controls/Button';
import DropdownMenu from '../components/overlays/Dropdown';

const keys = [
  { id: 'prod-openai', provider: 'OpenAI', lastRotated: 'há 4 dias', status: 'Ativa' },
  { id: 'finops-anthropic', provider: 'Anthropic', lastRotated: 'há 12 dias', status: 'Ativa' },
  { id: 'sandbox-local', provider: 'Custom', lastRotated: 'há 40 dias', status: 'Expirar em breve' },
];

export default function Keys() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">Chaves & credenciais</h1>
          <p className="text-muted mb-0">Administre chaves MCP com rotação automática e testes de conectividade.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Rotacionar selecionadas
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'plus']}>
            Registrar nova chave
          </Button>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start align-items-md-center">
            <div>
              <h2 className="h5 mb-1">Chaves MCP</h2>
              <p className="text-muted mb-0">Status de rotação, provider e últimas verificações.</p>
            </div>
            <DropdownMenu
              toggleLabel="Filtrar"
              items={[
                { id: 'all', label: 'Todas', icon: ['far', 'circle'] },
                { id: 'active', label: 'Ativas', icon: ['fas', 'play'] },
                { id: 'expiring', label: 'Expirando', icon: ['fas', 'rotate-right'] },
              ]}
            />
          </div>
          <div className="list-group">
            {keys.map((item) => (
              <div key={item.id} className="list-group-item d-flex flex-column flex-md-row gap-2 justify-content-between">
                <div>
                  <h3 className="h6 mb-1">{item.id}</h3>
                  <p className="text-muted mb-0">Provider: {item.provider}</p>
                </div>
                <div className="d-flex align-items-center gap-3">
                  <div className="text-muted small">Última rotação: {item.lastRotated}</div>
                  <span
                    className={`badge ${
                      item.status === 'Ativa'
                        ? 'text-bg-success'
                        : item.status === 'Expirar em breve'
                          ? 'text-bg-warning'
                          : 'text-bg-secondary'
                    }`}
                  >
                    {item.status}
                  </span>
                  <Button variant="outline" leadingIcon={['fas', 'pen']}>
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="d-flex flex-column gap-2">
        <h2 className="h5 mb-0">Estados padrão</h2>
        <div className="alert alert-info mb-0" role="status">
          Validando chaves e permissões…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhuma chave cadastrada para este workspace.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao sincronizar credenciais. Revise secrets do backend.
        </div>
      </section>
    </div>
  );
}
