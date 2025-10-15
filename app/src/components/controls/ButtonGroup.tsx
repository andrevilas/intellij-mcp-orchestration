import classNames from 'classnames';
import type { HTMLAttributes } from 'react';

import Button, { type ButtonProps } from './Button';

export interface ButtonGroupAction extends Omit<ButtonProps, 'className'> {
  id: string;
}

interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  actions: ButtonGroupAction[];
  ariaLabel: string;
  onAction?: (id: string) => void;
}

export default function ButtonGroup({ actions, ariaLabel, onAction, className, ...props }: ButtonGroupProps) {
  return (
    <div className={classNames('btn-group', className)} role="group" aria-label={ariaLabel} {...props}>
      {actions.map(({ id, ...buttonProps }) => (
        <Button
          key={id}
          {...buttonProps}
          onClick={(event) => {
            buttonProps.onClick?.(event);
            onAction?.(id);
          }}
        />
      ))}
    </div>
  );
}
