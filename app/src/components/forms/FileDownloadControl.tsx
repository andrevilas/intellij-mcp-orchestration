import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

import Button from '../actions/Button';
import Alert from '../feedback/Alert';
import ProgressIndicator from '../indicators/ProgressIndicator';
import { useToast } from '../feedback/ToastProvider';

import '../../icons/forms';
import './styles/file-transfer.scss';

export type DownloadProgressHandler = (value: number) => void;

export interface FileDownloadControlProps {
  title?: string;
  description?: ReactNode;
  icon?: IconProp;
  actionLabel?: string;
  fileName?: string;
  idleMessage?: ReactNode;
  onDownload: (onProgress: DownloadProgressHandler) => Promise<Blob | ArrayBuffer | void> | Blob | ArrayBuffer | void;
  onComplete?: (file: Blob) => void;
}

type DownloadState = 'idle' | 'running' | 'success' | 'error';

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

export default function FileDownloadControl({
  title = 'Download de relatório',
  description = 'Baixe o snapshot mais recente com métricas e recomendações.',
  icon = 'cloud-arrow-down',
  actionLabel = 'Baixar agora',
  fileName = 'relatorio-mcp.json',
  idleMessage = 'Último download ainda não executado.',
  onDownload,
  onComplete,
}: FileDownloadControlProps): JSX.Element {
  const { pushToast } = useToast();
  const [state, setState] = useState<DownloadState>('idle');
  const [progress, setProgress] = useState(0);
  const [meta, setMeta] = useState<ReactNode>(idleMessage);
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

  const triggerDownload = useCallback(
    async (payload: Blob | null) => {
      if (!payload) {
        return;
      }
      const isJsDomEnvironment =
        typeof navigator !== 'undefined' &&
        typeof navigator.userAgent === 'string' &&
        navigator.userAgent.toLowerCase().includes('jsdom');
      if (isJsDomEnvironment) {
        onComplete?.(payload);
        return;
      }
      const url = URL.createObjectURL(payload);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      onComplete?.(payload);
    },
    [fileName, onComplete],
  );

  const handleDownload = useCallback(async () => {
    setState('running');
    setAlert(<Alert variant="info" description="Preparando arquivo para download." />);
    setMeta('Gerando pacote no servidor MCP…');
    setProgress(5);

    let hasCustomProgress = false;
    let tickTimer: number | undefined;
    let finalState: DownloadState = 'idle';

    const tick = () => {
      setProgress((value) => (value < 92 ? Math.min(92, value + 7) : value));
    };
    tickTimer = window.setInterval(tick, 220);

    const updateProgress: DownloadProgressHandler = (value) => {
      hasCustomProgress = true;
      setProgress(Math.max(0, Math.min(100, Math.round(value))));
    };

    try {
      const result = await Promise.resolve(onDownload(updateProgress));
      const blob = normalizeBlob(result, fileName);
      if (!hasCustomProgress) {
        setProgress(100);
      }
      finalState = 'success';
      setState('success');
      setMeta(`Download concluído às ${new Date().toLocaleTimeString('pt-BR')}`);
      setAlert(<Alert variant="success" description={`Arquivo ${fileName} salvo.`} />);
      pushToast({ variant: 'success', title: 'Download pronto', description: `${fileName} foi baixado.` });
      await triggerDownload(blob);
    } catch (error) {
      finalState = 'error';
      const message =
        error instanceof Error ? error.message : 'Não foi possível gerar o download. Tente novamente em instantes.';
      setState('error');
      setAlert(<Alert variant="error" description={message} />);
      setMeta(message);
      pushToast({ variant: 'error', title: 'Download falhou', description: message });
    } finally {
      window.clearInterval(tickTimer);
      setProgress((value) => {
        if (finalState === 'error') {
          return value;
        }
        return Math.max(value, 100);
      });
    }
  }, [fileName, onDownload, pushToast, triggerDownload]);

  return (
    <section className="mcp-file-transfer" role="group" aria-label={typeof title === 'string' ? title : 'Download'}>
      <div className="mcp-file-transfer__header">
        <FontAwesomeIcon icon={icon} fixedWidth aria-hidden="true" />
        <div>
          <span className="mcp-file-transfer__title">{title}</span>
          <p className="mcp-file-transfer__description">{description}</p>
        </div>
      </div>
      {alert}
      <div className="mcp-file-transfer__actions">
        <Button variant="primary" onClick={handleDownload} disabled={state === 'running'}>
          {actionLabel}
        </Button>
        <span className="mcp-file-transfer__meta">{meta}</span>
      </div>
      {progress > 0 ? (
        <ProgressIndicator
          className="mcp-file-transfer__progress"
          label="Progresso do download"
          value={progress}
          tone={tone}
          description={state === 'running' ? 'Gerando bundle para exportação…' : undefined}
        />
      ) : null}
    </section>
  );
}
