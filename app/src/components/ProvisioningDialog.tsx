import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { PolicyOverridesConfig, ProviderSummary } from '../api';
import Alert, { type AlertVariant } from './feedback/Alert';
import FormModal from './modals/FormModal';
import { useToast } from './feedback/ToastProvider';

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
  const { pushToast } = useToast();
  const [reason, setReason] = useState('');
  const [maxIters, setMaxIters] = useState('');
  const [requestTimeout, setRequestTimeout] = useState('');
  const [totalTimeout, setTotalTimeout] = useState('');
  const [sampleRate, setSampleRate] = useState('10');
  const [requireHitl, setRequireHitl] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const reasonRef = useRef<HTMLInputElement | null>(null);
  const liveCounter = useRef(0);
  const [liveMessage, setLiveMessage] = useState('');

  const statusLabel = useMemo(
    () =>
      requireHitl ? 'Aprovação humana obrigatória' : 'Execução automática com overrides opcionais',
    [requireHitl],
  );

  useEffect(() => {
    if (!isOpen || !provider) {
      return;
    }

    setErrors({});
    setMaxIters('');
    setRequestTimeout('');
    setTotalTimeout('');
    setSampleRate('10');
    setRequireHitl(false);
    setReason(`Provisionamento para ${provider.name}`);
    setLiveMessage('');

    const frame = requestAnimationFrame(() => {
      reasonRef.current?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen, provider]);

  const announce = useCallback(
    (message: string, variant: AlertVariant) => {
      liveCounter.current += 1;
      const identifier = `${liveCounter.current}. ${message}`;
      setLiveMessage(identifier);
      pushToast({
        id: `provision-${liveCounter.current}-${Date.now()}`,
        description: message,
        variant,
      });
    },
    [pushToast],
  );

  const handleCancel = useCallback(() => {
    if (!provider) {
      return;
    }
    announce(`Provisionamento cancelado para ${provider.name}.`, 'warning');
    onCancel();
  }, [announce, onCancel, provider]);

  if (!isOpen || !provider) {
    return null;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
      announce('Não foi possível enviar overrides; revise os campos destacados.', 'error');
      return;
    }

    const overrides = buildOverrides({
      maxIters,
      requestTimeout,
      totalTimeout,
      sampleRate,
      requireHitl,
    });

    const trimmedReason = reason.trim();
    onConfirm({ reason: trimmedReason, overrides });
    announce(`Provisionamento enviado para ${provider.name} com motivo "${trimmedReason}".`, 'success');
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <FormModal
      isOpen={isOpen}
      title={`Overrides táticos para ${provider.name}`}
      description={statusLabel}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      isSubmitting={isSubmitting}
      submitLabel={isSubmitting ? 'Provisionando…' : 'Provisionar com overrides'}
    >
      <div className="provisioning-dialog__form">
        {hasErrors ? (
          <Alert variant="error" description="Revise os campos destacados antes de provisionar." />
        ) : null}
        <label className="form-field">
          <span>Motivo</span>
          <input
            ref={reasonRef}
            data-autofocus="true"
            type="text"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={errors.reason ? 'true' : 'false'}
            aria-describedby={errors.reason ? 'reason-error' : undefined}
            placeholder="Descreva o porquê deste provisionamento"
          />
          {errors.reason ? (
            <span id="reason-error" className="form-field__error">
              {errors.reason}
            </span>
          ) : null}
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
            {errors.maxIters ? (
              <span id="maxiters-error" className="form-field__error">
                {errors.maxIters}
              </span>
            ) : null}
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
            {errors.requestTimeout ? (
              <span id="requesttimeout-error" className="form-field__error">
                {errors.requestTimeout}
              </span>
            ) : null}
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
            {errors.totalTimeout ? (
              <span id="totaltimeout-error" className="form-field__error">
                {errors.totalTimeout}
              </span>
            ) : null}
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
            {errors.sampleRate ? (
              <span id="samplerate-error" className="form-field__error">
                {errors.sampleRate}
              </span>
            ) : null}
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

        <span className="visually-hidden" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </span>
      </div>
    </FormModal>
  );
}
