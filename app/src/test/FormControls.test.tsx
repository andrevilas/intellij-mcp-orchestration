import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { McpFormProvider, useMcpField, useMcpForm, useMcpFormContext } from '../hooks/useMcpForm';
import { FormErrorSummary, Input, InputGroup, Select } from '../components/forms';
import '../icons';

interface SampleValues {
  name: string;
  environment: string;
  endpoint: string;
}

describe('Form controls integration', () => {
  function SampleForm(): JSX.Element {
    const methods = useMcpForm<SampleValues>({
      defaultValues: { name: '', environment: '', endpoint: '' },
      mode: 'onSubmit',
    });
    return (
      <McpFormProvider {...methods}>
        <SampleFormFields />
      </McpFormProvider>
    );
  }

  function SampleFormFields(): JSX.Element {
    const { handleSubmit } = useMcpFormContext<SampleValues>();
    const nameField = useMcpField<SampleValues>('name', {
      rules: { required: 'Informe o nome.' },
    });
    const environmentField = useMcpField<SampleValues>('environment', {
      rules: { required: 'Selecione o ambiente.' },
    });
    const endpointField = useMcpField<SampleValues>('endpoint', {
      rules: {
        required: 'Informe o endpoint.',
        pattern: {
          value: /^https?:\/\//i,
          message: 'URL deve iniciar com http:// ou https://.',
        },
      },
    });

    return (
      <form onSubmit={handleSubmit(() => undefined)} noValidate>
        <FormErrorSummary focusOnError={false} />
        <Input
          {...nameField.inputProps}
          label="Nome"
          required
          helperText="Obrigatório para provisionar agentes."
          error={nameField.error}
        />
        <Select {...environmentField.inputProps} label="Ambiente" error={environmentField.error}>
          <option value="">Selecione…</option>
          <option value="dev">Desenvolvimento</option>
        </Select>
        <InputGroup
          {...endpointField.inputProps}
          label="Endpoint"
          placeholder="https://"
          leftIcon="globe"
          rightIcon="lock"
          helperText="HTTPS obrigatório."
          error={endpointField.error}
        />
        <button type="submit">Enviar</button>
      </form>
    );
  }

  it('exibe resumo de erros e propaga aria-invalid', async () => {
    const user = userEvent.setup();
    render(<SampleForm />);

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(4);
    expect(alerts[0]).toHaveTextContent('Revise os campos destacados.');

    const nameInput = screen.getByLabelText(/Nome/);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');

    const focusButton = screen.getAllByRole('button', { name: 'Informe o nome.' })[0];
    await user.click(focusButton);
    expect(nameInput).toHaveFocus();
  });

  it('combina helper e feedback em InputGroup', async () => {
    const user = userEvent.setup();
    render(<SampleForm />);

    const endpointInput = screen.getByLabelText('Endpoint');
    await user.type(endpointInput, 'ftp://example');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    const feedback = await screen.findByText('URL deve iniciar com http:// ou https://.', {
      selector: 'p.invalid-feedback',
    });
    expect(feedback).toBeVisible();
    expect(endpointInput).toHaveAttribute('aria-invalid', 'true');
  });
});
