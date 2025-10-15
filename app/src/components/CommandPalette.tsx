import { useEffect, useMemo, useRef, useState } from 'react';

import { useAgent, type AgentError } from '../hooks/useAgent';

export interface CommandOption {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string;
  keywords?: readonly string[];
  onSelect: () => void;
}

interface CatalogSearchItem {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  url?: string;
}

interface CatalogSearchResult {
  items?: CatalogSearchItem[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandOption[];
  onAgentResultSelect?: (item: CatalogSearchItem) => void;
}

const HOME_SEARCH_AGENT = 'catalog-search';
const AGENT_RESULT_LIMIT = 5;

export default function CommandPalette({
  isOpen,
  onClose,
  commands,
  onAgentResultSelect,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const {
    data: agentData,
    error: agentError,
    isFallback: isAgentFallback,
    invoke: invokeAgent,
    reset: resetAgent,
  } = useAgent<CatalogSearchResult>(HOME_SEARCH_AGENT, {
    defaultConfig: {
      metadata: { caller: 'command-palette' },
    },
  });
  const [isAgentUnavailable, setAgentUnavailable] = useState(false);

  useEffect(() => {
    if (isAgentFallback) {
      setAgentUnavailable(true);
    }
  }, [isAgentFallback]);

  useEffect(() => {
    const normalized = query.trim();

    if (!normalized) {
      if (!isAgentUnavailable) {
        resetAgent({ preserveFallback: true });
      }
      return;
    }

    if (isAgentUnavailable) {
      return;
    }

    const controller = new AbortController();
    invokeAgent({
      input: { query: normalized, limit: AGENT_RESULT_LIMIT },
      config: { parameters: { limit: AGENT_RESULT_LIMIT } },
      signal: controller.signal,
    }).catch((error: AgentError) => {
      console.error('Falha ao consultar agente inteligente', error);
    });

    return () => controller.abort();
  }, [query, invokeAgent, resetAgent, isAgentUnavailable]);

  const agentCommands = useMemo(() => {
    const items = agentData?.result?.items ?? [];
    if (!items || items.length === 0) {
      return [] as CommandOption[];
    }

    return items
      .filter((item) => item && (item.name || item.sku))
      .map((item, index) => {
        const title = item.name ?? item.sku ?? `Sugestão ${index + 1}`;
        const subtitleParts = [item.description, item.category].filter(Boolean) as string[];
        const subtitle = subtitleParts.length > 0
          ? subtitleParts.join(' • ')
          : 'Sugestão do agente de catálogo';
        const keywords = [...(item.tags ?? []), 'agente'];
        const normalizedId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        return {
          id: `agent-${normalizedId}-${index}`,
          title,
          subtitle,
          keywords,
          onSelect: () => {
            onAgentResultSelect?.(item);
          },
        } satisfies CommandOption;
      });
  }, [agentData, onAgentResultSelect]);

  const mergedCommands = useMemo(
    () => [...commands, ...agentCommands],
    [commands, agentCommands],
  );

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
      return mergedCommands;
    }

    return mergedCommands.filter((command) => {
      const haystack = [command.title, command.subtitle, ...(command.keywords ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [mergedCommands, query]);

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
    if (!isOpen || !dialogRef.current) {
      return;
    }

    const dialog = dialogRef.current;

    function handleTabKey(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return;
      }

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', handleTabKey);
    return () => {
      dialog.removeEventListener('keydown', handleTabKey);
    };
  }, [isOpen]);

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
        ref={dialogRef}
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
        {isAgentUnavailable ? (
          <p className="command-palette__agent-hint" role="status">
            {agentError?.message ?? 'Agente de busca indisponível. Revertendo para catálogo local.'}
          </p>
        ) : agentError ? (
          <p className="command-palette__agent-hint command-palette__agent-hint--error" role="status">
            {agentError.message}
          </p>
        ) : null}
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
