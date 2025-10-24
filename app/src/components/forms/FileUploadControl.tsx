import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

import Button from '../actions/Button';
import Alert from '../feedback/Alert';
import ProgressIndicator from '../indicators/ProgressIndicator';
import { useToast } from '../feedback/ToastProvider';

import '../../icons/forms';
import './styles/file-transfer.scss';

export type UploadProgressHandler = (value: number) => void;

export interface FileUploadControlProps {
  title?: string;
  description?: ReactNode;
  accept?: string;
  maxSizeBytes?: number;
  icon?: IconProp;
  actionLabel?: string;
  idleMessage?: ReactNode;
  onUpload?: (file: File, onProgress: UploadProgressHandler) => Promise<void> | void;
  onComplete?: (file: File) => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function FileUploadControl({
  title = 'Upload de artefato',
  description = 'Envie um arquivo JSON ou YAML para provisionar o workflow.',
  accept = '.json,.yaml,.yml',
  maxSizeBytes = 5 * 1024 * 1024,
  icon = 'cloud-arrow-up',
  actionLabel = 'Selecionar arquivo',
  idleMessage = 'Nenhum arquivo selecionado.',
  onUpload,
  onComplete,
}: FileUploadControlProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { pushToast } = useToast();
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [feedback, setFeedback] = useState<ReactNode>(idleMessage);
  const [alert, setAlert] = useState<ReactNode | null>(null);

  const tone = useMemo(() => {
    if (state === 'error') {
      return 'danger';
    }
    if (state === 'success') {
      return 'success';
    }
    return 'info';
  }, [state]);

  const handleFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const resetInputValue = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (maxSizeBytes && file.size > maxSizeBytes) {
        const errorMessage = `O arquivo excede o limite de ${formatBytes(maxSizeBytes)}.`;
        setState('error');
        setFeedback(errorMessage);
        setAlert(<Alert variant="error" description={errorMessage} />);
        pushToast({ variant: 'error', title: 'Upload bloqueado', description: errorMessage });
        resetInputValue();
        return;
      }

      const fileSummary = `${file.name} • ${formatBytes(file.size)}`;
      setState('uploading');
      setFeedback(`Enviando ${fileSummary}`);
      setAlert(<Alert variant="info" description={`Carregando ${fileSummary}`} />);
      setProgress(5);

      let hasCustomProgress = false;
      let tickTimer: number | undefined;
      let finalState: UploadState = 'idle';

      const tick = () => {
        setProgress((value) => (value < 90 ? Math.min(90, value + 6) : value));
      };

      tickTimer = window.setInterval(tick, 240);

      const updateProgress: UploadProgressHandler = (value) => {
        hasCustomProgress = true;
        setProgress(Math.max(0, Math.min(100, Math.round(value))));
      };

      try {
        await Promise.resolve(onUpload?.(file, updateProgress));
        if (!hasCustomProgress) {
          setProgress(100);
        }
        finalState = 'success';
        setState('success');
        setFeedback(`Upload concluído: ${fileSummary}`);
        setAlert(<Alert variant="success" description={`Arquivo ${file.name} disponível para uso.`} />);
        pushToast({ variant: 'success', title: 'Upload concluído', description: `${file.name} enviado com sucesso.` });
        onComplete?.(file);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível concluir o upload. Tente novamente.';
        finalState = 'error';
        setState('error');
        setFeedback(message);
        setAlert(<Alert variant="error" description={message} />);
        pushToast({ variant: 'error', title: 'Falha no upload', description: message });
      } finally {
        window.clearInterval(tickTimer);
        setProgress((value) => {
          if (finalState === 'error') {
            return value;
          }
          return Math.max(value, 100);
        });
        resetInputValue();
      }
    },
    [maxSizeBytes, onUpload, onComplete, pushToast, resetInputValue],
  );

  return (
    <section className="mcp-file-transfer" role="group" aria-label={typeof title === 'string' ? title : 'Upload'}>
      <div className="mcp-file-transfer__header">
        <FontAwesomeIcon icon={icon} fixedWidth aria-hidden="true" />
        <div>
          <span className="mcp-file-transfer__title">{title}</span>
          <p className="mcp-file-transfer__description">{description}</p>
        </div>
      </div>
      {alert}
      <div className="mcp-file-transfer__actions">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <Button variant="secondary" onClick={handleFileDialog} disabled={state === 'uploading'}>
          {actionLabel}
        </Button>
        {maxSizeBytes ? (
          <span className="mcp-file-transfer__meta">Limite: {formatBytes(maxSizeBytes)}</span>
        ) : null}
        <span className="mcp-file-transfer__meta">{feedback}</span>
      </div>
      {progress > 0 ? (
        <ProgressIndicator
          className="mcp-file-transfer__progress"
          label="Progresso do upload"
          value={progress}
          tone={tone}
          description={state === 'uploading' ? 'Enviando para o storage MCP…' : undefined}
        />
      ) : null}
    </section>
  );
}
