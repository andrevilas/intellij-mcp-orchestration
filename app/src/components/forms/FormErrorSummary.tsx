import { useEffect } from 'react';
import type { ReactNode } from 'react';

import Alert from '../feedback/Alert';
import { useFormErrorSummary, useMcpFormContext } from '../../hooks/useMcpForm';
import type { FormErrorSummaryItem } from '../../hooks/useMcpForm';

import './styles/form-base.scss';
import './styles/form-feedback.scss';

export interface FormErrorSummaryProps {
  title?: string;
  description?: ReactNode;
  focusOnError?: boolean;
  items?: FormErrorSummaryItem[];
}

export default function FormErrorSummary({
  title = 'Revise os campos destacados.',
  description = 'Algumas informações estão incompletas ou inválidas. Selecione um item para navegar até o campo correspondente.',
  focusOnError = true,
  items,
}: FormErrorSummaryProps): JSX.Element | null {
  const methods = useMcpFormContext();
  const contextItems = useFormErrorSummary();
  const errors = items ?? contextItems;

  useEffect(() => {
    if (!focusOnError || errors.length === 0) {
      return;
    }
    const first = errors[0];
    if (!first) {
      return;
    }
    try {
      methods.setFocus(first.name as never, { shouldSelect: true });
    } catch (error) {
      // Ignore focus errors when field is not focusable.
    }
  }, [errors, focusOnError, methods]);

  if (errors.length === 0) {
    return null;
  }

  return (
    <Alert
      variant="error"
      title={title}
      description={
        <div className="mcp-form-error-summary">
          {description ? <p className="mcp-form-helper">{description}</p> : null}
          <ul className="mcp-form-error-summary__list">
            {errors.map((item) => (
              <li key={item.name}>
                <button
                  type="button"
                  className="mcp-form-error-summary__link"
                  onClick={() => {
                    methods.setFocus(item.name as never, { shouldSelect: true });
                  }}
                >
                  {item.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
