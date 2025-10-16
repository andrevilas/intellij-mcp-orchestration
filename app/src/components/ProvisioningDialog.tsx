import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { PolicyOverridesConfig, ProviderSummary } from '../api';

export interface ProvisioningSubmission {
  reason: string;
  overrides: PolicyOverridesConfig | null;
}

interface ProvisioningDialogProps {
  isOpen: boolean;
  provider: ProviderSummary | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (submission: ProvisioningSubmission) => void;
}

interface FormErrors {
  reason?: string;
  maxIters?: string;
  requestTimeout?: string;
  totalTimeout?: string;
  sampleRate?: string;
}

function normalizeNumberField(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return NaN;
  }
  return parsed;
}

function buildOverrides(
  fields: {
    maxIters: string;
    requestTimeout: string;
    totalTimeout: string;
    sampleRate: string;
    requireHitl: boolean;
  },
): PolicyOverridesConfig | null {
  const overrides: PolicyOverridesConfig = {};
  const runtime: NonNullable<PolicyOverridesConfig['runtime']> = {};
  const timeouts: NonNullable<NonNullable<PolicyOverridesConfig['runtime']>['timeouts']> = {};

  const maxItersValue = normalizeNumberField(fields.maxIters);
  if (maxItersValue && !Number.isNaN(maxItersValue) && maxItersValue > 0) {
    runtime.maxIters = Math.round(maxItersValue);
  }

  const perIteration = normalizeNumberField(fields.requestTimeout);
  if (perIteration !== null && !Number.isNaN(perIteration) && perIteration > 0) {
    timeouts.perIteration = perIteration;
  }

  const total = normalizeNumberField(fields.totalTimeout);
  if (total !== null && !Number.isNaN(total) && total > 0) {
    timeouts.total = total;
  }

  if (Object.keys(timeouts).length > 0) {
    runtime.timeouts = timeouts;
  }

  if (Object.keys(runtime).length > 0) {
    overrides.runtime = runtime;
  }

  const sample = normalizeNumberField(fields.sampleRate);
  if (sample !== null && !Number.isNaN(sample)) {
    const normalized = Math.min(100, Math.max(0, sample));
    overrides.tracing = {
      enabled: normalized > 0,
      sampleRate: normalized / 100,
      exporter: null,
    };
  }

  if (fields.requireHitl) {
    overrides.hitl = { enabled: true };
  }

  return Object.keys(overrides).length === 0 ? null : overrides;
}

export default function ProvisioningDialog({
  isOpen,
  provider,
  isSubmitting,
  onCancel,
  onConfirm,
}: ProvisioningDialogProps) {
  const [reason, setReason] = useState('');
  const [maxIters, setMaxIters] = useState('');
  const [requestTimeout, setRequestTimeout] = useState('');
  const [totalTimeout, setTotalTimeout] = useState('');
  const [sampleRate, setSampleRate] = useState('10');
  const [requireHitl, setRequireHitl] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const reasonRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setErrors({});
    setMaxIters('');
    setRequestTimeout('');
    setTotalTimeout('');
    setSampleRate('10');
    setRequireHitl(false);
    setReason(provider ? `Provisionamento para ${provider.name}` : 'Provisionamento manual');

    const frame = requestAnimationFrame(() => {
      reasonRef.current?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, provider?.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [isOpen, onCancel]);

  if (!isOpen || !provider) {
    return null;
  }

  const statusLabel = requireHitl
    ? 'Aprovação humana obrigatória'
    : 'Execução automática com overrides opcionais';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FormErrors = {};

    const maxItersValue = normalizeNumberField(maxIters);
    if (maxIters && (Number.isNaN(maxItersValue) || (maxItersValue ?? 0) <= 0)) {
      nextErrors.maxIters = 'Informe um número maior que zero.';
    }

    const requestValue = normalizeNumberField(requestTimeout);
    if (requestTimeout && (Number.isNaN(requestValue) || (requestValue ?? 0) <= 0)) {
      nextErrors.requestTimeout = 'Timeout por iteração deve ser maior que zero.';
    }

    const totalValue = normalizeNumberField(totalTimeout);
    if (totalTimeout && (Number.isNaN(totalValue) || (totalValue ?? 0) <= 0)) {
      nextErrors.totalTimeout = 'Timeout total deve ser maior que zero.';
    }

    const sampleValue = normalizeNumberField(sampleRate);
    if (sampleRate && (Number.isNaN(sampleValue) || (sampleValue ?? 0) < 0 || (sampleValue ?? 0) > 100)) {
      nextErrors.sampleRate = 'Amostragem deve estar entre 0% e 100%.';
    }

    if (!reason.trim()) {
      nextErrors.reason = 'Descreva o motivo do provisionamento.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const overrides = buildOverrides({
      maxIters,
      requestTimeout,
      totalTimeout,
      sampleRate,
      requireHitl,
    });

    onConfirm({ reason: reason.trim(), overrides });
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === dialogRef.current) {
      onCancel();
    }
  }

  return (
    <div
      className="provisioning-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provisioning-dialog-title"
      onClick={handleBackdropClick}
      ref={dialogRef}
    >
      <div className="provisioning-dialog__content">
        <header className="provisioning-dialog__header">
          <div>
            <h2 id="provisioning-dialog-title">Overrides táticos para {provider.name}</h2>
            <p>{statusLabel}</p>
          </div>
          <button type="button" className="button button--ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </button>
        </header>
        <form className="provisioning-dialog__form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Motivo</span>
            <input
              ref={reasonRef}
              type="text"
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={errors.reason ? 'true' : 'false'}
              aria-describedby={errors.reason ? 'reason-error' : undefined}
              placeholder="Descreva o porquê deste provisionamento"
            />
            {errors.reason && (
              <span id="reason-error" className="form-field__error">
                {errors.reason}
              </span>
            )}
          </label>

          <div className="provisioning-dialog__grid">
            <label className="form-field">
              <span>Máximo de iterações</span>
              <input
                type="number"
                min={1}
                name="maxIters"
                value={maxIters}
                onChange={(event) => setMaxIters(event.target.value)}
                aria-invalid={errors.maxIters ? 'true' : 'false'}
                aria-describedby={errors.maxIters ? 'maxiters-error' : undefined}
                placeholder="ex.: 3"
              />
              {errors.maxIters && (
                <span id="maxiters-error" className="form-field__error">
                  {errors.maxIters}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout por iteração (s)</span>
              <input
                type="number"
                min={1}
                name="requestTimeout"
                value={requestTimeout}
                onChange={(event) => setRequestTimeout(event.target.value)}
                aria-invalid={errors.requestTimeout ? 'true' : 'false'}
                aria-describedby={errors.requestTimeout ? 'requesttimeout-error' : undefined}
                placeholder="ex.: 45"
              />
              {errors.requestTimeout && (
                <span id="requesttimeout-error" className="form-field__error">
                  {errors.requestTimeout}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Timeout total (s)</span>
              <input
                type="number"
                min={1}
                name="totalTimeout"
                value={totalTimeout}
                onChange={(event) => setTotalTimeout(event.target.value)}
                aria-invalid={errors.totalTimeout ? 'true' : 'false'}
                aria-describedby={errors.totalTimeout ? 'totaltimeout-error' : undefined}
                placeholder="ex.: 120"
              />
              {errors.totalTimeout && (
                <span id="totaltimeout-error" className="form-field__error">
                  {errors.totalTimeout}
                </span>
              )}
            </label>

            <label className="form-field">
              <span>Sample rate de tracing (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                name="sampleRate"
                value={sampleRate}
                onChange={(event) => setSampleRate(event.target.value)}
                aria-invalid={errors.sampleRate ? 'true' : 'false'}
                aria-describedby={errors.sampleRate ? 'samplerate-error' : undefined}
                placeholder="ex.: 10"
              />
              {errors.sampleRate && (
                <span id="samplerate-error" className="form-field__error">
                  {errors.sampleRate}
                </span>
              )}
            </label>
          </div>

          <label className="form-field form-field--checkbox">
            <input
              type="checkbox"
              name="requireHitl"
              checked={requireHitl}
              onChange={(event) => setRequireHitl(event.target.checked)}
            />
            <span>Exigir aprovação humana antes de executar</span>
          </label>

          <div className="provisioning-dialog__actions">
            <button type="button" className="button button--ghost" onClick={onCancel} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" className="button button--primary" disabled={isSubmitting}>
              {isSubmitting ? 'Provisionando…' : 'Provisionar com overrides'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
