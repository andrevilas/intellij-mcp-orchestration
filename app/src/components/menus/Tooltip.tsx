import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import './tooltip.scss';

export interface TooltipProps {
  children: ReactElement;
  content: ReactNode;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  delay?: number;
}

export default function Tooltip({
  children,
  content,
  placement = 'top',
  delay = 120,
}: TooltipProps): JSX.Element {
  const tooltipId = useId();
  const [isVisible, setVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const show = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  };

  const describedBy = [
    (children.props as { 'aria-describedby'?: string })['aria-describedby'],
    isVisible ? tooltipId : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  const triggerProps = {
    ref: (instance: HTMLElement | null) => {
      const originalRef = (children as { ref?: React.Ref<HTMLElement> }).ref;
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
        hide();
        return;
      }
      children.props.onKeyDown?.(event);
    },
    'aria-describedby': describedBy.length > 0 ? describedBy : undefined,
  };

  return (
    <span className="mcp-tooltip" data-placement={placement}>
      {cloneElement(children, triggerProps)}
      {isVisible ? (
        <span role="tooltip" id={tooltipId} className="mcp-tooltip__bubble">
          {content}
        </span>
      ) : null}
    </span>
  );
}
