import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

import Button from '../actions/Button';
import Alert from '../feedback/Alert';
import ProgressIndicator from '../indicators/ProgressIndicator';
import { useToast } from '../feedback/ToastProvider';
import type { DownloadProgressHandler } from './FileDownloadControl';

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
  onDownload?: (
    file: File,
    onProgress: DownloadProgressHandler,
  ) => Promise<Blob | ArrayBuffer | void> | Blob | ArrayBuffer | void;
  downloadLabel?: string;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';
type DownloadState = 'idle' | 'running' | 'success' | 'error';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function normalizeBlob(payload: Blob | ArrayBuffer | void, fallbackName: string): Blob | null {
  if (payload instanceof Blob) {
    return payload;
  }
  if (payload instanceof ArrayBuffer) {
    return new Blob([payload], { type: 'application/octet-stream' });
  }
  if (payload === undefined) {
    return null;
  }
  console.warn(`Tipo de payload inesperado recebido pelo download de ${fallbackName}.`);
  return null;
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
  onDownload,
  downloadLabel = 'Baixar arquivo enviado',
}: FileUploadControlProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { pushToast } = useToast();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFeedback, setUploadFeedback] = useState<ReactNode>(idleMessage);
  const [uploadAlert, setUploadAlert] = useState<ReactNode | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadFeedback, setDownloadFeedback] = useState<ReactNode | null>(null);
  const [downloadAlert, setDownloadAlert] = useState<ReactNode | null>(null);

  const uploadTone = useMemo(() => {
    if (uploadState === 'error') {
      return 'danger';
    }
    if (uploadState === 'success') {
      return 'success';
    }
    return 'info';
  }, [uploadState]);

  const downloadTone = useMemo(() => {
    if (downloadState === 'error') {
      return 'danger';
    }
    if (downloadState === 'success') {
      return 'success';
    }
    return 'info';
  }, [downloadState]);

  const fileSummary = useMemo(() => {
    if (!uploadedFile) {
      return null;
    }
    return `${uploadedFile.name} • ${formatBytes(uploadedFile.size)}`;
  }, [uploadedFile]);

  const handleFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const resetInputValue = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const triggerDownload = useCallback((payload: Blob, fileName: string) => {
    const url = URL.createObjectURL(payload);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      if (maxSizeBytes && file.size > maxSizeBytes) {
        const errorMessage = `O arquivo excede o limite de ${formatBytes(maxSizeBytes)}.`;
        setUploadState('error');
        setUploadFeedback(errorMessage);
        setUploadAlert(<Alert variant="error" description={errorMessage} />);
        setUploadedFile(null);
        setDownloadState('idle');
        setDownloadProgress(0);
        setDownloadFeedback(null);
        setDownloadAlert(null);
        pushToast({ variant: 'error', title: 'Upload bloqueado', description: errorMessage });
        resetInputValue();
        return;
      }

      const fileSummary = `${file.name} • ${formatBytes(file.size)}`;
      setUploadedFile(null);
      setDownloadState('idle');
      setDownloadProgress(0);
      setDownloadFeedback(null);
      setDownloadAlert(null);
      setUploadState('uploading');
      setUploadFeedback(`Enviando ${fileSummary}`);
      setUploadAlert(<Alert variant="info" description={`Carregando ${fileSummary}`} />);
      setUploadProgress(5);

      let hasCustomProgress = false;
      let tickTimer: number | undefined;
      let finalState: UploadState = 'idle';

      const tick = () => {
        setUploadProgress((value) => (value < 90 ? Math.min(90, value + 6) : value));
      };

      tickTimer = window.setInterval(tick, 240);

      const updateProgress: UploadProgressHandler = (value) => {
        hasCustomProgress = true;
        setUploadProgress(Math.max(0, Math.min(100, Math.round(value))));
      };

      try {
        await Promise.resolve(onUpload?.(file, updateProgress));
        if (!hasCustomProgress) {
          setUploadProgress(100);
        }
        finalState = 'success';
        setUploadState('success');
        setUploadFeedback(`Upload concluído: ${fileSummary}`);
        setUploadAlert(<Alert variant="success" description={`Arquivo ${file.name} disponível para uso.`} />);
        setUploadedFile(file);
        setDownloadFeedback(onDownload ? 'Arquivo pronto para download.' : null);
        pushToast({ variant: 'success', title: 'Upload concluído', description: `${file.name} enviado com sucesso.` });
        onComplete?.(file);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Não foi possível concluir o upload. Tente novamente.';
        finalState = 'error';
        setUploadState('error');
        setUploadFeedback(message);
        setUploadAlert(<Alert variant="error" description={message} />);
        setUploadedFile(null);
        pushToast({ variant: 'error', title: 'Falha no upload', description: message });
      } finally {
        window.clearInterval(tickTimer);
        setUploadProgress((value) => {
          if (finalState === 'error') {
            return value;
          }
          return Math.max(value, 100);
        });
        resetInputValue();
      }
    },
    [maxSizeBytes, onUpload, onComplete, onDownload, pushToast, resetInputValue],
  );

  const handleDownload = useCallback(async () => {
    if (!uploadedFile || !onDownload) {
      return;
    }
    const summary = `${uploadedFile.name} • ${formatBytes(uploadedFile.size)}`;
    setDownloadState('running');
    setDownloadAlert(<Alert variant="info" description={`Preparando ${summary} para download.`} />);
    setDownloadFeedback(`Preparando ${summary}`);
    setDownloadProgress(5);

    let hasCustomProgress = false;
    let tickTimer: number | undefined;
    let finalState: DownloadState = 'idle';

    const tick = () => {
      setDownloadProgress((value) => (value < 92 ? Math.min(92, value + 7) : value));
    };

    tickTimer = window.setInterval(tick, 220);

    const updateProgress: DownloadProgressHandler = (value) => {
      hasCustomProgress = true;
      setDownloadProgress(Math.max(0, Math.min(100, Math.round(value))));
    };

    try {
      const result = await Promise.resolve(onDownload(uploadedFile, updateProgress));
      const blob = normalizeBlob(result, uploadedFile.name);
      if (!blob) {
        throw new Error('Arquivo de download vazio. Tente reenviar o artefato.');
      }
      if (!hasCustomProgress) {
        setDownloadProgress(100);
      }
      finalState = 'success';
      setDownloadState('success');
      setDownloadFeedback(`Download pronto: ${uploadedFile.name}`);
      setDownloadAlert(<Alert variant="success" description={`Arquivo ${uploadedFile.name} baixado.`} />);
      pushToast({ variant: 'success', title: 'Download concluído', description: `${uploadedFile.name} salvo.` });
      triggerDownload(blob, uploadedFile.name);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Não foi possível gerar o download. Tente novamente.';
      finalState = 'error';
      setDownloadState('error');
      setDownloadFeedback(message);
      setDownloadAlert(<Alert variant="error" description={message} />);
      pushToast({ variant: 'error', title: 'Download falhou', description: message });
    } finally {
      window.clearInterval(tickTimer);
      setDownloadProgress((value) => {
        if (finalState === 'error') {
          return value;
        }
        return Math.max(value, 100);
      });
    }
  }, [onDownload, pushToast, triggerDownload, uploadedFile]);

  return (
    <section className="mcp-file-transfer" role="group" aria-label={typeof title === 'string' ? title : 'Upload'}>
      <div className="mcp-file-transfer__header">
        <FontAwesomeIcon icon={icon} fixedWidth aria-hidden="true" />
        <div>
          <span className="mcp-file-transfer__title">{title}</span>
          <p className="mcp-file-transfer__description">{description}</p>
        </div>
      </div>
      {uploadAlert}
      {downloadAlert}
      <div className="mcp-file-transfer__actions">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <Button variant="secondary" onClick={handleFileDialog} disabled={uploadState === 'uploading'}>
          {actionLabel}
        </Button>
        {maxSizeBytes ? (
          <span className="mcp-file-transfer__meta">Limite: {formatBytes(maxSizeBytes)}</span>
        ) : null}
        <span className="mcp-file-transfer__meta">{uploadFeedback}</span>
      </div>
      {uploadProgress > 0 ? (
        <ProgressIndicator
          className="mcp-file-transfer__progress"
          label="Progresso do upload"
          value={uploadProgress}
          tone={uploadTone}
          description={uploadState === 'uploading' ? 'Enviando para o storage MCP…' : undefined}
        />
      ) : null}
      {onDownload && uploadedFile ? (
        <div className="mcp-file-transfer__actions">
          <Button variant="ghost" onClick={() => void handleDownload()} disabled={downloadState === 'running'}>
            {downloadState === 'running' ? 'Preparando download…' : downloadLabel}
          </Button>
          <span className="mcp-file-transfer__meta">
            {downloadFeedback ?? (fileSummary ? `Arquivo atual: ${fileSummary}` : 'Arquivo disponível para download.')}
          </span>
        </div>
      ) : null}
      {onDownload && uploadedFile && downloadProgress > 0 ? (
        <ProgressIndicator
          className="mcp-file-transfer__progress"
          label="Progresso do download"
          value={downloadProgress}
          tone={downloadTone}
          description={downloadState === 'running' ? 'Gerando bundle para exportação…' : undefined}
        />
      ) : null}
    </section>
  );
}
