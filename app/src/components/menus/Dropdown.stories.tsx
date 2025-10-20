import { useMemo } from 'react';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '../actions/Button';
import Dropdown from './Dropdown';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';

const meta = {
  title: 'Menus/Dropdown',
  component: Dropdown,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Dropdown com foco controlado, fechamento via ESC/click fora e alinhamento configurável. Tokens de overlay usam `--mcp-z-dropdown`.',
      },
    },
  },
};

export default meta;

export const InteractiveMenu = {
  render: () => {
    const options = useMemo(
      () => [
        {
          id: 'deploy',
          label: 'Disparar deploy',
          description: 'Executa última versão aprovada',
          icon: <FontAwesomeIcon icon="rocket" fixedWidth aria-hidden="true" />,
          onSelect: () => console.log('deploy'),
        },
        {
          id: 'rollback',
          label: 'Iniciar rollback',
          description: 'Retorna para baseline anterior',
          icon: <FontAwesomeIcon icon="rotate-left" fixedWidth aria-hidden="true" />,
          onSelect: () => console.log('rollback'),
        },
        {
          id: 'archive',
          label: 'Arquivar',
          description: 'Mantém somente leitura',
          icon: <FontAwesomeIcon icon="box-archive" fixedWidth aria-hidden="true" />,
          disabled: true,
          onSelect: () => undefined,
        },
      ],
      [],
    );

    return (
      <StoryThemeProvider theme="light">
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <Dropdown label="Ações" options={options} />
          <Button variant="outline">Outro foco</Button>
        </div>
      </StoryThemeProvider>
    );
  },
};

export const DarkAlignEnd = {
  render: () => {
    const options = [
      {
        id: 'share',
        label: 'Compartilhar',
        description: 'Gera link protegido',
        onSelect: () => console.log('share'),
      },
    ];

    return (
      <StoryThemeProvider theme="dark">
        <Dropdown label="Opções" options={options} align="end" />
      </StoryThemeProvider>
    );
  },
};
