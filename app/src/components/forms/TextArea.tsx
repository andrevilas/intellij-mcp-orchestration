import { forwardRef, useId } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

import './forms.scss';
import { mergeIds } from './utils';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  required?: boolean;
}

const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
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
  const textAreaId = id ?? generatedId;
  const helperId = helperText ? `${textAreaId}-helper` : undefined;
  const errorId = error ? `${textAreaId}-error` : undefined;
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
        <label className="mcp-form-label" htmlFor={textAreaId}>
          {label}
          {required ? (
            <span className="mcp-form-label__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <textarea
        {...rest}
        id={textAreaId}
        ref={ref}
        className={clsx('mcp-form-control', 'mcp-textarea', className)}
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

export default TextArea;
