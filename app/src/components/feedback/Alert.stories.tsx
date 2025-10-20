import Alert from './Alert';
import Button from '../actions/Button';
import StoryThemeProvider from '../story-utils/StoryThemeProvider';

const meta = {
  title: 'Feedback/Alert',
  component: Alert,
  tags: ['ui-kit', 'tokens', 'a11y'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Alertas usam `role="status"` ou `role="alert"` com `aria-live` apropriado para anunciar sucesso, erro e avisos.',
      },
    },
  },
};

export default meta;

function AlertsStack(): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: '26rem' }}>
      <Alert title="Provisionamento" description="Instância criada com sucesso." variant="success" />
      <Alert
        title="Job em andamento"
        description="O fluxo noturno será concluído em 2 minutos."
        variant="info"
        action={<Button size="sm" variant="outline">Ver detalhes</Button>}
      />
      <Alert
        title="Erro de credencial"
        description="A chave do ambiente staging está inválida."
        variant="error"
        onDismiss={() => console.log('dismiss error')}
      />
    </div>
  );
}

export const Light = {
  render: () => (
    <StoryThemeProvider theme="light">
      <AlertsStack />
    </StoryThemeProvider>
  ),
};

export const Dark = {
  render: () => (
    <StoryThemeProvider theme="dark">
      <AlertsStack />
    </StoryThemeProvider>
  ),
};
