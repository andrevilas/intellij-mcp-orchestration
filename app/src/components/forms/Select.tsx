import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

import './forms.scss';
import { mergeIds } from './utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
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
    children,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helperId = helperText ? `${selectId}-helper` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const invalid = Boolean(error) || ariaInvalid === true || ariaInvalid === 'true';
  const describedBy = mergeIds(typeof ariaDescribedBy === 'string' ? ariaDescribedBy : undefined, helperId, errorId);
  const normalizedInvalid: SelectHTMLAttributes<HTMLSelectElement>['aria-invalid'] = invalid
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
        <label className="mcp-form-label" htmlFor={selectId}>
          {label}
          {required ? (
            <span className="mcp-form-label__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <select
        {...rest}
        id={selectId}
        ref={ref}
        className={clsx('mcp-form-control', 'mcp-select', className)}
        aria-invalid={normalizedInvalid}
        aria-describedby={describedBy}
        disabled={disabled}
      >
        {children}
      </select>
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

export default Select;
