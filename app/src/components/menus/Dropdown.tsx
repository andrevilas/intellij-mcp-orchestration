import clsx from 'clsx';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
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

export interface DropdownProps {
  label: ReactNode;
  options: DropdownOption[];
  className?: string;
  align?: 'start' | 'end';
  triggerAriaLabel?: string;
}

export default function Dropdown({
  label,
  options,
  className,
  align = 'start',
  triggerAriaLabel,
}: DropdownProps): JSX.Element {
  const triggerId = useId();
  const menuId = useId();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<'first' | 'last' | null>(null);

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
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
      });
    }

    document.addEventListener('mousedown', handleGlobalClick);
    window.addEventListener('keydown', handleGlobalKeyDown as unknown as EventListener);
    menuRef.current?.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      window.removeEventListener('keydown', handleGlobalKeyDown as unknown as EventListener);
      menuRef.current?.removeEventListener('focusout', handleFocusOut);
    };
  }, [focusOption, isOpen, options]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

    menu.addEventListener('keydown', handleKeyDown as unknown as EventListener);
    return () => menu.removeEventListener('keydown', handleKeyDown as unknown as EventListener);
  }, [focusOption, isOpen, options]);

  const handleTriggerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        pendingFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
        setOpen(true);
      }
    },
    [],
  );

  const handleOptionClick = useCallback(
    (option: DropdownOption) => {
      if (option.disabled) {
        return;
      }
      option.onSelect();
      setOpen(false);
      requestAnimationFrame(() => {
        triggerRef.current?.focus({ preventScroll: true });
      });
    },
    [],
  );

  const renderedOptions = useMemo(
    () =>
      options.map((option, index) => (
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
    [handleOptionClick, options],
  );

  useEffect(() => {
    optionRefs.current.length = options.length;
  }, [options.length]);

  return (
    <div className={clsx('mcp-dropdown', className)} data-open={isOpen}>
      <Button
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        id={triggerId}
        variant="secondary"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleTriggerKeyDown}
        type="button"
        className="mcp-dropdown__trigger"
        aria-label={triggerAriaLabel}
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
          {renderedOptions.length > 0 ? renderedOptions : (
            <Fragment>
              <span className="mcp-dropdown__empty" role="status" aria-live="polite">
                Nenhuma ação disponível
              </span>
            </Fragment>
          )}
        </div>
      ) : null}
    </div>
  );
}
