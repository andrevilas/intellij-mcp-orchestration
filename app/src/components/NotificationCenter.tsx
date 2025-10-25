import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { NotificationCategory, NotificationSeverity } from '../api';
import Button from './actions/Button';
import { type AlertVariant } from './feedback/Alert';
import { useToast } from './feedback/ToastProvider';
import './NotificationCenter.scss';

export interface NotificationItem {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  timestamp: string;
  category: NotificationCategory;
  tags: string[];
  isRead: boolean;
}

interface NotificationCenterProps {
  isOpen: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onToggleRead: (id: string, nextValue: boolean) => void;
  onMarkAllRead: () => void;
}

type FilterOption = 'all' | 'unread' | NotificationCategory;

const FILTER_LABELS: Record<FilterOption, string> = {
  all: 'Todas',
  unread: 'Não lidas',
  operations: 'Operações',
  finops: 'FinOps',
  policies: 'Policies',
  platform: 'Plataforma',
};

const FILTER_OPTIONS: FilterOption[] = ['all', 'unread', 'operations', 'finops', 'policies', 'platform'];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

const NotificationCenter = ({
  isOpen,
  notifications,
  onClose,
  onToggleRead,
  onMarkAllRead,
}: NotificationCenterProps) => {
  const { pushToast } = useToast();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const filterRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [filter, setFilter] = useState<FilterOption>('all');
  const liveCounter = useRef(0);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFilter('all');
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      liveCounter.current = 0;
      setLiveMessage('');
    }
  }, [isOpen]);

  const announce = useCallback(
    (message: string, variant: AlertVariant) => {
      liveCounter.current += 1;
      const identifier = `${liveCounter.current}. ${message}`;
      setLiveMessage(identifier);
      pushToast({
        id: `notification-${liveCounter.current}-${Date.now()}`,
        description: message,
        variant,
      });
    },
    [pushToast],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) {
      return;
    }

    const dialog = panelRef.current;

    function handleTabKey(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', handleTabKey);
    return () => {
      dialog.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (filter === 'all') {
        return true;
      }
      if (filter === 'unread') {
        return !notification.isRead;
      }
      return notification.category === filter;
    });
  }, [notifications, filter]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const handleMarkAll = useCallback(() => {
    if (unreadCount === 0) {
      return;
    }
    onMarkAllRead();
    announce('Todas as notificações foram marcadas como lidas.', 'success');
  }, [announce, onMarkAllRead, unreadCount]);

  const handleToggleNotification = useCallback(
    (notification: NotificationItem) => {
      const nextValue = !notification.isRead;
      onToggleRead(notification.id, nextValue);
      const message = nextValue
        ? `Notificação "${notification.title}" marcada como lida.`
        : `Notificação "${notification.title}" marcada como não lida.`;
      announce(message, nextValue ? 'success' : 'info');
    },
    [announce, onToggleRead],
  );

  return (
    <div
      className={isOpen ? 'notification-center__overlay notification-center__overlay--visible' : 'notification-center__overlay'}
      role="presentation"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        id="notification-center-panel"
        ref={panelRef}
        className={
          isOpen
            ? 'notification-center notification-center--open'
            : 'notification-center'
        }
        onClick={(event) => event.stopPropagation()}
      >
        <span className="visually-hidden" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </span>
        <header className="notification-center__header">
          <div>
            <p className="notification-center__eyebrow">Central de notificações</p>
            <h2 id="notification-center-title">Status operacionais e FinOps</h2>
            <p className="notification-center__summary" aria-live="polite">
              {unreadCount === 0
                ? 'Nenhuma notificação pendente. Continue monitorando!'
                : `${unreadCount} notificações aguardando revisão.`}
            </p>
          </div>
          <div className="notification-center__controls">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="notification-center__mark-all"
              onClick={handleMarkAll}
              disabled={unreadCount === 0}
            >
              Limpar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="notification-center__close"
              onClick={onClose}
              ref={closeButtonRef}
            >
              Fechar
            </Button>
          </div>
        </header>
        <div
          className="notification-center__filters"
          role="radiogroup"
          aria-label="Filtrar notificações"
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            const keysToHandle = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
            if (!keysToHandle.includes(event.key)) {
              return;
            }

            event.preventDefault();
            const currentIndex = Math.max(FILTER_OPTIONS.indexOf(filter), 0);
            let nextIndex = currentIndex;

            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              nextIndex = (currentIndex + 1) % FILTER_OPTIONS.length;
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              nextIndex = (currentIndex - 1 + FILTER_OPTIONS.length) % FILTER_OPTIONS.length;
            } else if (event.key === 'Home') {
              nextIndex = 0;
            } else if (event.key === 'End') {
              nextIndex = FILTER_OPTIONS.length - 1;
            }

            const nextFilter = FILTER_OPTIONS[nextIndex];
            setFilter(nextFilter);
            requestAnimationFrame(() => {
              filterRefs.current[nextIndex]?.focus();
            });
          }}
        >
          {FILTER_OPTIONS.map((option, index) => {
            const label = FILTER_LABELS[option];
            const isActive = filter === option;
            const extraCount =
              option === 'unread'
                ? unreadCount
                : option === 'all'
                  ? notifications.length
                  : notifications.filter((notification) => notification.category === option).length;
            const buttonLabel = `${label}${extraCount > 0 ? ` (${extraCount})` : ''}`;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={
                  isActive
                    ? 'notification-center__filter notification-center__filter--active'
                    : 'notification-center__filter'
                }
                tabIndex={isActive ? 0 : -1}
                onClick={() => setFilter(option)}
                ref={(element) => {
                  filterRefs.current[index] = element;
                }}
              >
                {buttonLabel}
              </button>
            );
          })}
        </div>
        <ul className="notification-center__list" aria-label="Lista de notificações">
          {filteredNotifications.length === 0 ? (
            <li className="notification-center__empty">Nenhuma notificação encontrada para o filtro selecionado.</li>
          ) : (
            filteredNotifications.map((notification) => (
              <li
                key={notification.id}
                className={`notification notification--${notification.severity}${
                  notification.isRead ? ' notification--read' : ''
                }`}
              >
                <div className="notification__header">
                  <span className="notification__badge" aria-hidden="true" />
                  <div>
                    <p className="notification__category">{FILTER_LABELS[notification.category]}</p>
                    <h3>{notification.title}</h3>
                  </div>
                  <time dateTime={notification.timestamp}>{formatTimestamp(notification.timestamp)}</time>
                </div>
                <p className="notification__message">{notification.message}</p>
                {notification.tags.length > 0 && (
                  <ul className="notification__tags" aria-label="Tags da notificação">
                    {notification.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                )}
                <div className="notification__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="notification__action"
                    onClick={() => handleToggleNotification(notification)}
                  >
                    {notification.isRead ? 'Marcar como não lida' : 'Marcar como lida'}
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
};

export default NotificationCenter;
