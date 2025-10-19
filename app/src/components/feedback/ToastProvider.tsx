import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useTheme } from '../../theme/ThemeContext';
import Alert, { type AlertVariant } from './Alert';
import Button from '../actions/Button';
import './feedback.scss';

export interface ToastOptions {
  id?: string;
  title?: string;
  description: ReactNode;
  variant?: AlertVariant;
  dismissible?: boolean;
  autoDismiss?: boolean;
  duration?: number;
}

export interface ToastHandle {
  id: string;
  dismiss: () => void;
}

interface ToastContextValue {
  pushToast: (options: ToastOptions) => ToastHandle;
  dismissToast: (id: string) => void;
}

interface ToastInternal extends Required<Pick<ToastOptions, 'id'>> {
  title?: string;
  description: ReactNode;
  variant: AlertVariant;
  dismissible: boolean;
  autoDismiss: boolean;
  duration: number;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children, maxVisible = 3 }: { children: ReactNode; maxVisible?: number }): JSX.Element {
  const { theme } = useTheme();
  const [items, setItems] = useState<ToastInternal[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      for (const timeout of timeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      timeoutsRef.current.clear();
    };
  }, []);

  const dismissToast = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (toast: ToastInternal) => {
      if (!toast.autoDismiss) {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration);
      timeoutsRef.current.set(toast.id, timeoutId);
    },
    [dismissToast],
  );

  const pushToast = useCallback(
    (options: ToastOptions): ToastHandle => {
      const toast: ToastInternal = {
        id: options.id ?? createId(),
        title: options.title,
        description: options.description,
        variant: options.variant ?? 'info',
        dismissible: options.dismissible !== false,
        autoDismiss: options.autoDismiss ?? true,
        duration: options.duration ?? 6000,
      };

      setItems((current) => {
        const next = [toast, ...current.filter((item) => item.id !== toast.id)].slice(0, maxVisible);
        return next;
      });

      scheduleAutoDismiss(toast);

      return {
        id: toast.id,
        dismiss: () => dismissToast(toast.id),
      };
    },
    [dismissToast, maxVisible, scheduleAutoDismiss],
  );

  const value = useMemo(() => ({ pushToast, dismissToast }), [dismissToast, pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="mcp-toast-viewport" data-theme={theme} aria-live="polite">
        {items.map((toast) => (
          <Alert
            key={toast.id}
            title={toast.title}
            description={toast.description}
            variant={toast.variant}
            action={
              toast.dismissible ? (
                <Button size="sm" variant="ghost" onClick={() => dismissToast(toast.id)}>
                  Dispensar
                </Button>
              ) : null
            }
            onDismiss={toast.dismissible ? () => dismissToast(toast.id) : undefined}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser utilizado dentro de ToastProvider');
  }
  return context;
}
