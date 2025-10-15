import Dropdown from 'bootstrap/js/dist/dropdown';
import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useRef, useState } from 'react';

import Button, { type ButtonProps } from '../controls/Button';

export interface DropdownItem {
  id: string;
  label: string;
  description?: string;
  icon?: ButtonProps['leadingIcon'];
  disabled?: boolean;
}

interface DropdownProps {
  toggleLabel: string;
  items: DropdownItem[];
  onSelect?: (item: DropdownItem) => void;
  align?: 'start' | 'end';
  variant?: ButtonProps['variant'];
  className?: string;
}

export default function DropdownMenu({
  toggleLabel,
  items,
  onSelect,
  align = 'end',
  variant = 'outline',
  className,
}: DropdownProps) {
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const toggleEl = toggleRef.current;
    if (!toggleEl) {
      return;
    }
    const dropdown = Dropdown.getOrCreateInstance(toggleEl, { autoClose: true });
    const onShown = () => setIsOpen(true);
    const onHidden = () => setIsOpen(false);
    toggleEl.addEventListener('shown.bs.dropdown', onShown);
    toggleEl.addEventListener('hidden.bs.dropdown', onHidden);
    return () => {
      toggleEl.removeEventListener('shown.bs.dropdown', onShown);
      toggleEl.removeEventListener('hidden.bs.dropdown', onHidden);
      dropdown.dispose();
    };
  }, []);

  return (
    <div className={classNames('dropdown', className)}>
      <Button
        ref={toggleRef}
        data-bs-toggle="dropdown"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        variant={variant}
        trailingIcon={['fas', 'chevron-down']}
      >
        {toggleLabel}
      </Button>
      <ul className={classNames('dropdown-menu shadow-sm', { 'dropdown-menu-end': align === 'end' })} role="menu">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="dropdown-item d-flex flex-column align-items-start"
              onClick={() => onSelect?.(item)}
              disabled={item.disabled}
              role="menuitem"
            >
              <span className="d-flex align-items-center gap-2">
                {item.icon ? <FontAwesomeIcon icon={item.icon} fixedWidth className="text-muted" /> : null}
                <span>{item.label}</span>
              </span>
              {item.description ? <small className="text-muted">{item.description}</small> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
