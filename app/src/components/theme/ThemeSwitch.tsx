import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';
import { useId } from 'react';

import { useTheme } from './ThemeProvider';

interface ThemeSwitchProps {
  className?: string;
}

export default function ThemeSwitch({ className }: ThemeSwitchProps) {
  const { theme, toggleTheme } = useTheme();
  const switchId = useId();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={classNames('btn btn-outline-secondary d-inline-flex align-items-center gap-2', className)}
      aria-pressed={isDark}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={toggleTheme}
      id={switchId}
    >
      <FontAwesomeIcon icon={isDark ? ['fas', 'sun'] : ['fas', 'moon']} />
      <span className="d-none d-md-inline">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}
