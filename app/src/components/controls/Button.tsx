import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'link';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  outline: 'btn-outline-secondary',
  link: 'btn-link',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  leadingIcon?: Parameters<typeof FontAwesomeIcon>[0]['icon'];
  trailingIcon?: Parameters<typeof FontAwesomeIcon>[0]['icon'];
  loading?: boolean;
  children?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      leadingIcon,
      trailingIcon,
      loading = false,
      disabled,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        type="button"
        className={classNames('btn d-inline-flex align-items-center gap-2', VARIANT_CLASS[variant], className)}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        ref={ref}
        {...props}
      >
        {loading && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />}
        {!loading && leadingIcon ? <FontAwesomeIcon icon={leadingIcon} fixedWidth /> : null}
        {children}
        {!loading && trailingIcon ? <FontAwesomeIcon icon={trailingIcon} fixedWidth /> : null}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
