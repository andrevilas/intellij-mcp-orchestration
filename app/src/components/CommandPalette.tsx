import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: readonly string[];
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandOption[];
}

export default function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery('');
    setActiveIndex(0);

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return commands;
    }

    return commands.filter((command) => {
      const haystack = [command.title, command.subtitle, ...(command.keywords ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [commands, query]);

  useEffect(() => {
    if (activeIndex >= filteredCommands.length) {
      setActiveIndex(filteredCommands.length > 0 ? 0 : -1);
    }
  }, [filteredCommands.length, activeIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (!isOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (filteredCommands.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => {
          const nextIndex = current < filteredCommands.length - 1 ? current + 1 : 0;
          return nextIndex;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => {
          if (current <= 0) {
            return filteredCommands.length - 1;
          }

          return current - 1;
        });
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const command = filteredCommands[activeIndex];
        if (command) {
          command.onSelect();
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [filteredCommands, activeIndex, isOpen, onClose]);

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }

    const target = itemsRef.current[activeIndex];
    if (target && document.activeElement !== target) {
      target.focus();
    }
  }, [activeIndex, filteredCommands]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="command-palette__overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="command-palette__header">
          <div>
            <p className="command-palette__eyebrow">Command Palette</p>
            <h2 id="command-palette-title">Ações rápidas</h2>
          </div>
          <p className="command-palette__hint">
            Pesquise superfícies e ações. Use <kbd>↑</kbd>/<kbd>↓</kbd> para navegar.
          </p>
        </header>
        <div className="command-palette__search">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <path
              fill="currentColor"
              d="M12.9 14.32a6.5 6.5 0 1 1 1.41-1.41l3.4 3.39-1.4 1.41-3.41-3.39ZM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            type="search"
            placeholder="Busque por destino ou ação"
            aria-label="Buscar comando"
          />
          <span className="command-palette__shortcut">⌘K</span>
        </div>
        <ul className="command-palette__results" role="listbox">
          {filteredCommands.length === 0 && (
            <li className="command-palette__empty">Nenhum comando encontrado</li>
          )}
          {filteredCommands.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={
                  index === activeIndex
                    ? 'command-palette__option command-palette__option--active'
                    : 'command-palette__option'
                }
                ref={(element) => {
                  itemsRef.current[index] = element;
                }}
                onClick={() => {
                  command.onSelect();
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="command-palette__option-title">{command.title}</span>
                {command.subtitle ? (
                  <span className="command-palette__option-subtitle">{command.subtitle}</span>
                ) : null}
                {command.shortcut ? (
                  <kbd className="command-palette__option-shortcut">{command.shortcut}</kbd>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
