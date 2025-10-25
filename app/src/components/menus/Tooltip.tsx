import {
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import './tooltip.scss';

export interface TooltipDelay {
  open?: number;
  close?: number;
}

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number | TooltipDelay;
  disabled?: boolean;
  loading?: boolean;
  loadingContent?: ReactNode;
}

export default function Tooltip({
  children,
  content,
  placement = 'top',
  delay,
  disabled = false,
  loading = false,
  loadingContent,
}: TooltipProps): JSX.Element {
  const tooltipId = useId();
  const [isVisible, setVisible] = useState(false);
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const delays = useMemo(() => {
    if (typeof delay === 'number') {
      return { open: delay, close: delay };
    }
    const parsed = delay ?? {};
    return {
      open: parsed.open ?? 120,
      close: parsed.close ?? 80,
    };
  }, [delay]);

  const clearTimers = () => {
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const show = () => {
    if (disabled) {
      return;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
    }
    openTimeoutRef.current = window.setTimeout(() => setVisible(true), delays.open);
  };

  const hide = () => {
    if (openTimeoutRef.current) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      closeTimeoutRef.current = null;
    }, delays.close);
  };

  useEffect(() => {
    if (disabled) {
      clearTimers();
      setVisible(false);
    }
  }, [disabled]);

  const describedBy = [
    (children.props as { 'aria-describedby'?: string })['aria-describedby'],
    !disabled && isVisible ? tooltipId : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  const triggerProps = {
    ref: (instance: HTMLElement | null) => {
      const originalRef = (children as { ref?: Ref<HTMLElement> }).ref;
      if (typeof originalRef === 'function') {
        originalRef(instance);
      } else if (originalRef && typeof originalRef === 'object') {
        (originalRef as { current: HTMLElement | null }).current = instance;
      }
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      children.props.onFocus?.(event);
      show();
    },
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      children.props.onBlur?.(event);
      hide();
    },
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => {
      children.props.onPointerEnter?.(event);
      show();
    },
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => {
      children.props.onPointerLeave?.(event);
      hide();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape') {
        clearTimers();
        setVisible(false);
        return;
      }
      children.props.onKeyDown?.(event);
    },
    'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
  };

  const bubbleContent = loading ? loadingContent ?? 'Carregando…' : content;
  const tooltipState = disabled ? 'disabled' : loading ? 'loading' : isVisible ? 'open' : 'closed';

  return (
    <span className="mcp-tooltip" data-placement={placement} data-state={tooltipState} aria-busy={loading || undefined}>
      {cloneElement(children, triggerProps)}
      {isVisible && !disabled ? (
        <span
          role="tooltip"
          id={tooltipId}
          className="mcp-tooltip__bubble"
          data-state={loading ? 'loading' : 'ready'}
          aria-busy={loading || undefined}
          onPointerEnter={show}
          onPointerLeave={hide}
        >
          {loading ? <span className="mcp-tooltip__spinner" aria-hidden="true" /> : null}
          <span className="mcp-tooltip__content">{bubbleContent}</span>
        </span>
      ) : null}
    </span>
  );
}
