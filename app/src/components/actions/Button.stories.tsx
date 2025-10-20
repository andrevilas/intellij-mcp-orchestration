import { Fragment } from 'react';

import Button from './Button';
import ButtonGroup from './ButtonGroup';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';

const meta = {
  title: 'Actions/Button',
  component: Button,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/mcp-actions-tokens',
    },
    docs: {
      description: {
        component:
          'Variantes mapeadas para os tokens `--mcp-action-*`, cobrindo estados de carregamento, desabilitado e uso em toolbars.',
      },
    },
  },
};

export default meta;

function Showcase(): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: '1rem', minWidth: '22rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button variant="primary">Primário</Button>
        <Button variant="secondary">Secundário</Button>
        <Button variant="danger">Perigoso</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="link">Link</Button>
        <Button variant="primary" loading>
          Loading
        </Button>
        <Button variant="secondary" disabled>
          Desabilitado
        </Button>
      </div>
      <ButtonGroup label="Toolbar de demonstração" segmented>
        <Button aria-label="Executar" icon={<span aria-hidden="true">▶</span>} />
        <Button aria-label="Repetir" variant="secondary" icon={<span aria-hidden="true">⟲</span>} />
        <Button aria-label="Cancelar" variant="danger" icon={<span aria-hidden="true">■</span>} />
      </ButtonGroup>
    </div>
  );
}

export const Light = {
  name: 'Light — tokens MCP',
  render: () => (
    <StoryThemeProvider theme="light">
      <Showcase />
    </StoryThemeProvider>
  ),
};

export const Dark = {
  name: 'Dark — tokens MCP',
  render: () => (
    <StoryThemeProvider theme="dark">
      <Showcase />
    </StoryThemeProvider>
  ),
};

export const WithAria = {
  name: 'Anúncios ARIA',
  render: () => (
    <StoryThemeProvider theme="light">
      <Fragment>
        <p style={{ maxWidth: '28rem' }}>
          Os botões preservam atributos como <code>aria-busy</code> quando <strong>loading</strong> e suportam roving focus em
          toolbars com <code>role="toolbar"</code>.
        </p>
        <Showcase />
      </Fragment>
    </StoryThemeProvider>
  ),
};
