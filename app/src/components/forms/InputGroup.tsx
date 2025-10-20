import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';

import './forms.scss';
import { mergeIds } from './utils';

export interface InputGroupProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  leftIcon?: IconProp;
  rightIcon?: IconProp;
}

const InputGroup = forwardRef<HTMLInputElement, InputGroupProps>(function InputGroup(
  {
    id,
    label,
    helperText,
    error,
    required,
    leftIcon,
    rightIcon,
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
  const normalizedInvalid = invalid ? 'true' : ariaInvalid != null ? String(ariaInvalid) : undefined;

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
      <div className={clsx('mcp-input-group', { 'mcp-input-group--invalid': invalid })}>
        {leftIcon ? (
          <span className="mcp-input-group__icon" aria-hidden="true">
            <FontAwesomeIcon icon={leftIcon} fixedWidth />
          </span>
        ) : null}
        <input
          {...rest}
          id={inputId}
          ref={ref}
          className={clsx('mcp-input-group__control', className)}
          aria-invalid={normalizedInvalid}
          aria-describedby={describedBy}
          disabled={disabled}
        />
        {rightIcon ? (
          <span className="mcp-input-group__icon" aria-hidden="true">
            <FontAwesomeIcon icon={rightIcon} fixedWidth />
          </span>
        ) : null}
      </div>
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

export default InputGroup;
