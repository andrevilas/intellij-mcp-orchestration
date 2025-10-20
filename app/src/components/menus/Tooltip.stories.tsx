import Button from '../actions/Button';
import Tooltip from './Tooltip';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';

const meta = {
  title: 'Menus/Tooltip',
  component: Tooltip,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Tooltip com delays configuráveis (`delay={{ open, close }}`), fechamento via ESC e preservação de `aria-describedby`.',
      },
    },
  },
};

export default meta;

export const PoliteAnnouncement = {
  render: () => (
    <StoryThemeProvider theme="light">
      <Tooltip content="Atalho ⌘K" delay={{ open: 150, close: 80 }}>
        <Button variant="outline">Paleta</Button>
      </Tooltip>
    </StoryThemeProvider>
  ),
};

export const DarkPlacement = {
  render: () => (
    <StoryThemeProvider theme="dark">
      <Tooltip content="Fila em processamento" placement="right" delay={180}>
        <Button variant="secondary">Status</Button>
      </Tooltip>
    </StoryThemeProvider>
  ),
};
