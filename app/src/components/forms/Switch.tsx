import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import './styles/form-base.scss';
import './styles/switch.scss';
import { mergeIds } from './utils';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  {
    id,
    label,
    description,
    error,
    required,
    className,
    disabled,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const descriptionId = description ? `${switchId}-description` : undefined;
  const errorId = error ? `${switchId}-error` : undefined;
  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const describedBy = mergeIds(typeof ariaDescribedBy === 'string' ? ariaDescribedBy : undefined, descriptionId, errorId);
  const normalizedInvalid: InputHTMLAttributes<HTMLInputElement>['aria-invalid'] = invalid
    ? ariaInvalid && ariaInvalid !== 'false'
      ? ariaInvalid
      : true
    : ariaInvalid ?? undefined;

  return (
    <div className={clsx('mcp-form-field', { 'mcp-form-field--invalid': invalid })}>
      <div className={clsx('mcp-switch', { 'mcp-switch--invalid': invalid, 'mcp-form-field--disabled': disabled })}>
        <div className="mcp-switch__body">
          <span className="mcp-switch__control">
            <input
              {...rest}
              id={switchId}
              ref={ref}
              type="checkbox"
              className={clsx('mcp-switch__input', className, { 'is-invalid': invalid })}
              aria-invalid={normalizedInvalid}
              aria-describedby={describedBy}
              disabled={disabled}
            />
            <span className="mcp-switch__track">
              <span className="mcp-switch__thumb" aria-hidden="true" />
            </span>
          </span>
          <label className="mcp-form-label" htmlFor={switchId}>
            {label}
            {required ? (
              <span className="mcp-form-label__required" aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
        </div>
        {description ? (
          <p className="mcp-switch__hint" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {error ? (
          <p className="invalid-feedback" role="alert" id={errorId}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export default Switch;
