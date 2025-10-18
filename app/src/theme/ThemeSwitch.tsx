import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import { useId } from 'react';

import { useTheme } from './ThemeContext';

interface ThemeSwitchProps {
  className?: string;
}

export default function ThemeSwitch({ className }: ThemeSwitchProps): JSX.Element {
  const { theme, setTheme } = useTheme();
  const switchId = useId();
  const isDark = theme === 'dark';

  return (
    <div className={clsx('btn-group theme-switch', className)} role="group" aria-label="Alternar tema">
      <button
        type="button"
        className={clsx('btn btn-outline-secondary', { active: !isDark })}
        aria-pressed={!isDark}
        onClick={() => setTheme('light')}
        id={`${switchId}-light`}
      >
        <FontAwesomeIcon icon="sun" className="me-2" fixedWidth aria-hidden />
        Claro
      </button>
      <button
        type="button"
        className={clsx('btn btn-outline-secondary', { active: isDark })}
        aria-pressed={isDark}
        onClick={() => setTheme('dark')}
        id={`${switchId}-dark`}
      >
        <FontAwesomeIcon icon="moon" className="me-2" fixedWidth aria-hidden />
        Escuro
      </button>
    </div>
  );
}
