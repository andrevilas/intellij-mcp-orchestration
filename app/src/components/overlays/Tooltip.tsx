import Tooltip from 'bootstrap/js/dist/tooltip';
import { cloneElement, useEffect, useRef, type MutableRefObject, type ReactElement, type Ref } from 'react';

interface TooltipProps {
  content: string;
  children: ReactElement;
  placement?: 'top' | 'bottom' | 'start' | 'end';
  delay?: number;
  trigger?: string;
}

export default function TooltipWrapper({
  content,
  children,
  placement = 'top',
  delay = 150,
  trigger = 'hover focus',
}: TooltipProps) {
  const targetRef = useRef<HTMLElement | null>(null);
  const originalRef = (children as ReactElement & { ref?: Ref<HTMLElement> }).ref;

  const assignRef = (ref: Ref<HTMLElement> | undefined, value: HTMLElement | null) => {
    if (!ref) {
      return;
    }
    if (typeof ref === 'function') {
      ref(value);
    } else {
      (ref as MutableRefObject<HTMLElement | null>).current = value;
    }
  };

  useEffect(() => {
    const element = targetRef.current;
    if (!element) {
      return;
    }
    const tooltip = Tooltip.getOrCreateInstance(element, {
      title: content,
      placement,
      trigger,
      delay: { show: delay, hide: Math.min(delay, 150) },
    });
    tooltip.setContent({ '.tooltip-inner': content });
    return () => {
      tooltip.dispose();
    };
  }, [content, placement, trigger, delay]);

  return cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      targetRef.current = node;
      assignRef(originalRef, node);
    },
    'data-bs-toggle': 'tooltip',
    'data-bs-placement': placement,
    'data-bs-trigger': trigger,
    'data-bs-title': content,
  });
}
