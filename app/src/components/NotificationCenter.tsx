import { useEffect, useMemo, useRef, useState } from 'react';

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationCategory = 'operations' | 'finops' | 'policies' | 'platform';

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
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [filter, setFilter] = useState<FilterOption>('all');

  useEffect(() => {
    if (isOpen) {
      setFilter('all');
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
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
        className={
          isOpen
            ? 'notification-center notification-center--open'
            : 'notification-center'
        }
        onClick={(event) => event.stopPropagation()}
      >
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
            <button
              type="button"
              className="notification-center__mark-all"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
            >
              Marcar tudo como lido
            </button>
            <button
              type="button"
              className="notification-center__close"
              onClick={onClose}
              ref={closeButtonRef}
            >
              Fechar
            </button>
          </div>
        </header>
        <div className="notification-center__filters" role="radiogroup" aria-label="Filtrar notificações">
          {FILTER_OPTIONS.map((option) => {
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
                onClick={() => setFilter(option)}
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
                  <button
                    type="button"
                    onClick={() => onToggleRead(notification.id, !notification.isRead)}
                    className="notification__action"
                  >
                    {notification.isRead ? 'Marcar como não lida' : 'Marcar como lida'}
                  </button>
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
