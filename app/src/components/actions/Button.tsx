import clsx from 'clsx';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import './button.scss';

type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'link' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps extends Omit<NativeButtonProps, 'type'> {
  /**
   * Visual variant defined pelo UI kit.
   * @default 'primary'
   */
  variant?: ButtonVariant;
  /**
   * Tamanho do botão.
   * @default 'md'
   */
  size?: ButtonSize;
  /**
   * Exibe spinner de carregamento e força `disabled=true`.
   */
  loading?: boolean;
  /**
   * Ícone opcional renderizado à esquerda do conteúdo.
   */
  icon?: ReactNode;
  /**
   * Tipo do botão nativo.
   * @default 'button'
   */
  type?: NativeButtonProps['type'];
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      icon,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    const state = loading ? 'loading' : isDisabled ? 'disabled' : 'ready';

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        className={clsx(
          'mcp-button',
          `mcp-button--${variant}`,
          `mcp-button--${size}`,
          loading && 'mcp-button--loading',
          className,
        )}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-variant={variant}
        data-state={state}
      >
        {loading && (
          <span className="mcp-button__spinner" aria-hidden="true" />
        )}
        {icon ? <span className="mcp-button__icon">{icon}</span> : null}
        <span className="mcp-button__content">{children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
