import { useMemo } from 'react';

import './App.css';

const TOOLING = [
  {
    name: 'Vite 5',
    description: 'Lightning fast dev server with HMR tailored for modern TypeScript.',
  },
  {
    name: 'React 18',
    description: 'Component model for building the Console MCP UI.',
  },
  {
    name: 'TypeScript',
    description: 'Type-safety for integration with MCP server metadata and schemas.',
  },
];

function App() {
  const tooling = useMemo(() => TOOLING, []);

  return (
    <main className="app">
      <section className="hero">
        <h1>MCP Console</h1>
        <p>
          Frontend scaffold pronto para conectar-se aos servidores MCP locais, com DX otimizada para experimentar
          integrações multi-agente.
        </p>
      </section>

      <section className="card-grid">
        {tooling.map((tool) => (
          <article key={tool.name} className="card">
            <h2>{tool.name}</h2>
            <p>{tool.description}</p>
          </article>
        ))}
      </section>

      <section className="next-steps">
        <h2>Próximos Passos</h2>
        <p>
          Configure `npm install` e `npm run dev` para iniciar o ambiente local. Os fluxos de autenticação e consoles de MCP
          serão implementados nas próximas tarefas do roadmap.
        </p>
      </section>
    </main>
  );
}

export default App;
