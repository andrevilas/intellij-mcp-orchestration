import clsx from 'clsx';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

import Button from '../actions/Button';
import './dropdown.scss';

export interface DropdownOption {
  id: string;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}

export type DropdownStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface DropdownStatusMessages {
  loading?: string;
  empty?: string;
  error?: string;
  success?: string;
}

export interface DropdownProps {
  label: ReactNode;
  options: DropdownOption[];
  className?: string;
  align?: 'start' | 'end';
  triggerAriaLabel?: string;
  status?: DropdownStatus;
  statusMessages?: DropdownStatusMessages;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export default function Dropdown({
  label,
  options,
  className,
  align = 'start',
  triggerAriaLabel,
  status,
  statusMessages,
  disabled = false,
  loading,
  loadingLabel,
}: DropdownProps): JSX.Element {
  const triggerId = useId();
  const menuId = useId();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<'first' | 'last' | null>(null);

  const resolvedMessages = useMemo(
    () => ({
      loading: 'Carregando ações…',
      empty: 'Nenhuma ação disponível',
      error: 'Não foi possível carregar ações.',
      success: 'Ações disponíveis.',
      ...(statusMessages ?? {}),
    }),
    [statusMessages],
  );

  const resolvedStatus: DropdownStatus = useMemo(() => {
    if (status) {
      return status;
    }
    return options.length === 0 ? 'empty' : 'success';
  }, [options.length, status]);

  const resolvedLoading = loading ?? resolvedStatus === 'loading';
  const isDisabled = disabled;
  const canToggle = !isDisabled;
  const isInteractive =
    !isDisabled && !resolvedLoading && (resolvedStatus === 'success' || resolvedStatus === 'idle');

  const focusOption = useCallback((index: number) => {
    const target = optionRefs.current[index];
    if (target) {
      target.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!isInteractive) {
      pendingFocus.current = null;
      return;
    }

    const enabled = options
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => !option.disabled);
    const firstEnabled = enabled[0]?.index ?? 0;
    const lastEnabled = enabled[enabled.length - 1]?.index ?? firstEnabled;
    const initialIndex = pendingFocus.current === 'last' ? lastEnabled : firstEnabled;
    pendingFocus.current = null;
    focusOption(initialIndex);

    function handleGlobalClick(event: MouseEvent) {
      const menu = menuRef.current;
      const trigger = triggerRef.current;
      if (!menu || !trigger) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (!menu.contains(target) && !trigger.contains(target)) {
        setOpen(false);
      }
    }

    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        requestAnimationFrame(() => {
          triggerRef.current?.focus({ preventScroll: true });
        });
      }
    }

    function handleFocusOut(event: FocusEvent) {
      const menu = menuRef.current;
      const trigger = triggerRef.current;
      if (!menu || !trigger) {
        return;
      }
      const related = event.relatedTarget as Node | null;
      if (related && (menu.contains(related) || trigger.contains(related))) {
        return;
      }
      setOpen(false);
      const shouldRestoreFocus = !(related instanceof HTMLElement);
      if (shouldRestoreFocus) {
        requestAnimationFrame(() => {
          triggerRef.current?.focus({ preventScroll: true });
        });
      }
    }

    document.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown);
    menuRef.current?.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      menuRef.current?.removeEventListener('focusout', handleFocusOut);
    };
  }, [focusOption, isInteractive, isOpen, options]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (!isInteractive) {
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const enabledOptions = options
          .map((option, index) => ({ option, index }))
          .filter(({ option }) => !option.disabled);
        if (enabledOptions.length === 0) {
          return;
        }
        const activeElement = document.activeElement;
        let currentIndex = enabledOptions.findIndex(({ index }) => optionRefs.current[index] === activeElement);
        if (currentIndex === -1) {
          currentIndex = 0;
        }
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = (currentIndex + delta + enabledOptions.length) % enabledOptions.length;
        focusOption(enabledOptions[nextIndex].index);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        const firstEnabled = options.findIndex((option) => !option.disabled);
        if (firstEnabled >= 0) {
          focusOption(firstEnabled);
        }
      }

      if (event.key === 'End') {
        event.preventDefault();
        const lastEnabled = [...options].reverse().findIndex((option) => !option.disabled);
        if (lastEnabled >= 0) {
          focusOption(options.length - 1 - lastEnabled);
        }
      }
    };

    menu.addEventListener('keydown', handleMenuKeyDown);
    return () => menu.removeEventListener('keydown', handleMenuKeyDown);
  }, [focusOption, isInteractive, isOpen, options]);

  const handleTriggerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!canToggle) {
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        pendingFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
        setOpen(true);
      }
    },
    [canToggle],
  );

  const handleOptionClick = useCallback(
    (option: DropdownOption) => {
      if (!isInteractive || option.disabled) {
        return;
      }
      option.onSelect();
      setOpen(false);
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
      });
    },
    [isInteractive],
  );

  const renderedOptions = useMemo(
    () =>
      !isInteractive
        ? []
        : options.map((option, index) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className={clsx('mcp-dropdown__option', option.disabled && 'mcp-dropdown__option--disabled')}
              onClick={() => handleOptionClick(option)}
              disabled={option.disabled}
              aria-disabled={option.disabled || undefined}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
            >
              {option.icon ? <span className="mcp-dropdown__icon">{option.icon}</span> : null}
              <span className="mcp-dropdown__label">{option.label}</span>
              {option.description ? (
                <span className="mcp-dropdown__description">{option.description}</span>
              ) : null}
            </button>
          )),
    [handleOptionClick, isInteractive, options],
  );

  useEffect(() => {
    optionRefs.current.length = options.length;
  }, [options.length]);

  const statusMarkup = useMemo(() => {
    if (!isOpen) {
      return null;
    }

    if (resolvedLoading) {
      return (
        <div
          className="mcp-dropdown__status mcp-dropdown__status--loading"
          role="status"
          aria-live="polite"
          aria-label={loadingLabel ?? resolvedMessages.loading}
        >
          <span className="mcp-dropdown__spinner" aria-hidden="true" />
          {loadingLabel ?? resolvedMessages.loading}
        </div>
      );
    }

    switch (resolvedStatus) {
      case 'empty':
        return (
          <div
            className="mcp-dropdown__status"
            role="status"
            aria-live="polite"
            aria-label={resolvedMessages.empty}
          >
            {resolvedMessages.empty}
          </div>
        );
      case 'error':
        return (
          <div
            className="mcp-dropdown__status mcp-dropdown__status--error"
            role="alert"
            aria-label={resolvedMessages.error}
          >
            {resolvedMessages.error}
          </div>
        );
      default:
        return null;
    }
  }, [isOpen, loadingLabel, resolvedLoading, resolvedMessages.empty, resolvedMessages.error, resolvedMessages.loading, resolvedStatus]);

  const componentState = isDisabled ? 'disabled' : resolvedLoading ? 'loading' : resolvedStatus;

  return (
    <div
      className={clsx('mcp-dropdown', className)}
      data-open={isOpen}
      data-state={componentState}
      aria-busy={resolvedLoading || undefined}
      data-disabled={isDisabled || undefined}
    >
      <Button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        id={triggerId}
        variant="secondary"
        onClick={() => {
          if (!canToggle) {
            return;
          }
          setOpen((value) => !value);
        }}
        onKeyDown={handleTriggerKeyDown}
        type="button"
        className="mcp-dropdown__trigger"
        aria-label={triggerAriaLabel}
        disabled={isDisabled}
        loading={resolvedLoading}
        allowInteractionWhileLoading={canToggle}
        data-state={componentState}
      >
        {label}
      </Button>
      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={clsx('mcp-dropdown__menu', `mcp-dropdown__menu--${align}`)}
          ref={menuRef}
        >
          {renderedOptions.length > 0
            ? renderedOptions
            : statusMarkup ?? (
                <Fragment>
                  <span className="mcp-dropdown__empty" role="status" aria-live="polite">
                    {resolvedMessages.success}
                  </span>
                </Fragment>
              )}
        </div>
      ) : null}
    </div>
  );
}
