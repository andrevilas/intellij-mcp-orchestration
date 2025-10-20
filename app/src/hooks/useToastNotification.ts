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
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!message) {
      lastMessageRef.current = null;
      return;
    }

    if (lastMessageRef.current === message) {
      return;
    }

    pushToast({
      id,
      title,
      description: message,
      variant,
      dismissible,
      autoDismiss,
      duration,
    });
    lastMessageRef.current = message;
  }, [message, id, title, variant, dismissible, autoDismiss, duration, pushToast]);
}
