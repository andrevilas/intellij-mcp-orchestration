import { useEffect, useRef } from 'react';

import type { ToastOptions } from '../components/feedback/ToastProvider';
import { useToast } from '../components/feedback/ToastProvider';

export type ToastNotificationConfig = Pick<ToastOptions, 'title' | 'variant' | 'dismissible' | 'autoDismiss' | 'duration'> & {
  id: string;
};

export function useToastNotification(
  message: string | null,
  { id, title, variant = 'info', dismissible, autoDismiss, duration }: ToastNotificationConfig,
): void {
  const { pushToast } = useToast();
  const historyRef = useRef<Set<string>>(new Set());
  const counterRef = useRef(0);

  useEffect(() => {
    if (!message) {
      historyRef.current.clear();
      return;
    }

    const normalized = message.trim();
    if (!normalized) {
      return;
    }

    if (historyRef.current.has(normalized)) {
      return;
    }

    historyRef.current.add(normalized);
    const sequence = counterRef.current++;

    pushToast({
      id: `${id}-${sequence}`,
      title,
      description: message,
      variant,
      dismissible,
      autoDismiss,
      duration,
    });

    if (historyRef.current.size > 10) {
      const iterator = historyRef.current.values().next();
      if (!iterator.done && typeof iterator.value === 'string') {
        historyRef.current.delete(iterator.value);
      }
    }
  }, [message, id, title, variant, dismissible, autoDismiss, duration, pushToast]);
}
