import Button from '../components/controls/Button';
import ButtonGroup from '../components/controls/ButtonGroup';
import Tooltip from '../components/overlays/Tooltip';

const servers = [
  { id: 'mcp-edge-01', status: 'Ativo', latency: '298 ms', region: 'us-east-1', health: 'Normal' },
  { id: 'mcp-edge-02', status: 'Em manutenção', latency: '-', region: 'us-west-2', health: 'Investigando' },
  { id: 'mcp-finops-01', status: 'Degradado', latency: '684 ms', region: 'sa-east-1', health: 'Atenção' },
];

export default function Servers() {
  return (
    <div className="d-flex flex-column gap-4">
      <section className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h1 className="h3 mb-1">Servers MCP</h1>
          <p className="text-muted mb-0">Gerencie start/stop, monitore latência e acompanhe health-checks.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Button variant="outline" leadingIcon={['fas', 'rotate-right']}>
            Atualizar lista
          </Button>
          <Button variant="primary" leadingIcon={['fas', 'plus']}>
            Registrar server
          </Button>
        </div>
      </section>

      <section className="card shadow-sm">
        <div className="card-body d-flex flex-column gap-3">
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3 align-items-start align-items-md-center">
            <div>
              <h2 className="h5 mb-1">Fleet MCP</h2>
              <p className="text-muted mb-0">Resumo dos servidores disponíveis e seus status atuais.</p>
            </div>
            <ButtonGroup
              ariaLabel="Ações em lote"
              actions={[
                { id: 'start', variant: 'secondary', leadingIcon: ['fas', 'play'], children: 'Start' },
                { id: 'stop', variant: 'outline', leadingIcon: ['fas', 'stop'], children: 'Stop' },
                { id: 'restart', variant: 'outline', leadingIcon: ['fas', 'rotate-right'], children: 'Restart' },
              ]}
            />
          </div>
          <div className="table-responsive rounded border">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Servidor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latência</th>
                  <th scope="col">Região</th>
                  <th scope="col">Health</th>
                  <th scope="col" className="text-end">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id}>
                    <th scope="row">{server.id}</th>
                    <td>
                      {server.status === 'Ativo' && <span className="badge text-bg-success">Ativo</span>}
                      {server.status === 'Em manutenção' && <span className="badge text-bg-secondary">Manutenção</span>}
                      {server.status === 'Degradado' && <span className="badge text-bg-warning">Degradado</span>}
                    </td>
                    <td>{server.latency}</td>
                    <td>{server.region}</td>
                    <td>{server.health}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2">
                        <Tooltip content="Editar server">
                          <Button variant="outline" leadingIcon={['fas', 'pen']} />
                        </Tooltip>
                        <Tooltip content="Remover server">
                          <Button variant="outline" leadingIcon={['fas', 'trash']} />
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
          Carregando servidores MCP…
        </div>
        <div className="alert alert-warning mb-0" role="status">
          Nenhum servidor cadastrado até o momento.
        </div>
        <div className="alert alert-danger mb-0" role="status">
          Erro ao consultar estado dos servidores. Verifique logs.
        </div>
      </section>
    </div>
  );
}
