import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { McpFormProvider, useMcpField, useMcpForm, useMcpFormContext } from '../../hooks/useMcpForm';
import {
  FileDownloadControl,
  FileUploadControl,
  FormErrorSummary,
  Input,
  InputGroup,
  Select,
} from '.';

vi.mock('../feedback/ToastProvider', () => ({
  useToast: () => ({
    pushToast: vi.fn(),
  }),
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:mock-url') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
});

afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

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

  it('exibe feedback acessível ao concluir upload', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<FileUploadControl onUpload={onUpload} />);

    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File([JSON.stringify({ ok: true })], 'artifact.json', { type: 'application/json' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    expect(onUpload).toHaveBeenCalledWith(file, expect.any(Function));
    expect(await screen.findByText(/Arquivo artifact\.json disponível para uso\./i)).toBeVisible();
    expect(await screen.findByText(/Upload concluído: artifact\.json/i)).toBeVisible();
  });

  it('permite baixar arquivo enviado quando callback é fornecido', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const payload = new Blob(['conteúdo'], { type: 'text/plain' });
    const onDownload = vi.fn().mockResolvedValue(payload);

    const { container } = render(<FileUploadControl onUpload={onUpload} onDownload={onDownload} />);

    const input = container.querySelector('input[type="file"]');
    const file = new File(['conteúdo'], 'bundle.txt', { type: 'text/plain' });
    Object.defineProperty(input as HTMLInputElement, 'files', {
      configurable: true,
      value: [file],
    });
    fireEvent.change(input as HTMLInputElement);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file, expect.any(Function)));

    await screen.findByText((content) => content.includes('Upload concluído: bundle.txt'));
    await screen.findByText(/Arquivo bundle\.txt disponível para uso\./i);

    const downloadButton = await screen.findByRole('button', { name: /Baixar arquivo enviado/i });
    await user.click(downloadButton);

    expect(onDownload).toHaveBeenCalledWith(file, expect.any(Function));
    expect(await screen.findByText(/Arquivo bundle\.txt baixado\./i)).toBeVisible();
  });

  it('informa conclusão de download e chama callback', async () => {
    const user = userEvent.setup();
    const payload = new Blob(['demo'], { type: 'text/plain' });
    const onDownload = vi.fn().mockResolvedValue(payload);
    const onComplete = vi.fn();

    render(<FileDownloadControl onDownload={onDownload} onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: 'Baixar agora' }));

    expect(onDownload).toHaveBeenCalled();
    expect(await screen.findByText(/Arquivo relatorio-mcp\.json salvo\./i)).toBeVisible();
    expect(onComplete).toHaveBeenCalledWith(payload);
  });
});
