import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import clsx from 'clsx';
import { useId } from 'react';

import { useTheme } from './ThemeContext';
import './theme-switch.scss';

interface ThemeSwitchProps {
  className?: string;
}

export default function ThemeSwitch({ className }: ThemeSwitchProps): JSX.Element {
  const { theme, setTheme } = useTheme();
  const switchId = useId();
  const statusId = `${switchId}-status`;
  const isDark = theme === 'dark';

  return (
    <div
      className={clsx('theme-switch', className)}
      role="group"
      aria-label="Alternar tema"
      aria-describedby={statusId}
    >
      <button
        type="button"
        className={clsx('theme-switch__button', {
          'theme-switch__button--active': !isDark,
        })}
        aria-pressed={!isDark}
        onClick={() => setTheme('light')}
        id={`${switchId}-light`}
      >
        <FontAwesomeIcon icon="sun" className="icon-leading" fixedWidth aria-hidden />
        Claro
      </button>
      <button
        type="button"
        className={clsx('theme-switch__button', {
          'theme-switch__button--active': isDark,
        })}
        aria-pressed={isDark}
        onClick={() => setTheme('dark')}
        id={`${switchId}-dark`}
      >
        <FontAwesomeIcon icon="moon" className="icon-leading" fixedWidth aria-hidden />
        Escuro
      </button>
      <span id={statusId} className="visually-hidden" aria-live="polite" aria-atomic="true">
        Tema atual: {isDark ? 'Escuro' : 'Claro'}
      </span>
    </div>
  );
}
