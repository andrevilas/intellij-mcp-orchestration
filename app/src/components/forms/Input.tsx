import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

import './styles/form-base.scss';
import './styles/control-inputs.scss';
import { mergeIds } from './utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    helperText,
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
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const describedBy = mergeIds(typeof ariaDescribedBy === 'string' ? ariaDescribedBy : undefined, helperId, errorId);
  const normalizedInvalid: InputHTMLAttributes<HTMLInputElement>['aria-invalid'] = invalid
    ? ariaInvalid && ariaInvalid !== 'false'
      ? ariaInvalid
      : true
    : ariaInvalid ?? undefined;

  return (
    <div
      className={clsx('mcp-form-field', {
        'mcp-form-field--invalid': invalid,
        'mcp-form-field--disabled': disabled,
      })}
    >
      {label ? (
        <label className="mcp-form-label" htmlFor={inputId}>
          {label}
          {required ? (
            <span className="mcp-form-label__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        {...rest}
        id={inputId}
        ref={ref}
        className={clsx('mcp-form-control', className)}
        aria-invalid={normalizedInvalid}
        aria-describedby={describedBy}
        disabled={disabled}
      />
      {helperText ? (
        <p className="mcp-form-helper" id={helperId}>
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p className="invalid-feedback" role="alert" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
});

export default Input;
