import clsx from 'clsx';
import {
  forwardRef,
  type HTMLAttributes,
} from 'react';

import './button-group.scss';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Rótulo acessível anunciado por leitores de tela.
   */
  label?: string;
  /**
   * ID de elemento que descreve o grupo. Ignorado se `label` for informado.
   */
  labelledBy?: string;
  /**
   * Direção de distribuição dos botões.
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  /**
   * Remove espaçamentos internos e une os botões como um segmento.
   */
  segmented?: boolean;
}

const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(
  (
    {
      children,
      className,
      label,
      labelledBy,
      orientation = 'horizontal',
      segmented = false,
      ...props
    },
    ref,
  ) => {
    const ariaProps =
      label != null
        ? { 'aria-label': label }
        : labelledBy
          ? { 'aria-labelledby': labelledBy }
          : {};

    return (
      <div
        {...props}
        {...ariaProps}
        ref={ref}
        role="toolbar"
        aria-orientation={orientation === 'vertical' ? 'vertical' : undefined}
        className={clsx(
          'mcp-button-group',
          className,
          orientation === 'vertical' && 'mcp-button-group--vertical',
          segmented && 'mcp-button-group--segmented',
        )}
        data-orientation={orientation}
      >
        {children}
      </div>
    );
  },
);

ButtonGroup.displayName = 'ButtonGroup';

export default ButtonGroup;
