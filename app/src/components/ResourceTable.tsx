import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';

import './resource-table.scss';

type SortDirection = 'asc' | 'desc';
type ResourceTableStatus = 'default' | 'loading' | 'empty' | 'error';

export interface ResourceTableColumn<T> {
  id: string;
  header: string;
  render: (item: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
  sortable?: boolean;
  sortAccessor?: (item: T) => string | number | Date | boolean | null | undefined;
  sortAriaLabel?: string;
}

export type ResourceTableEmptyState =
  | ReactNode
  | {
      title: string;
      description?: string;
      action?: ReactNode;
      illustration?: ReactNode;
    };

export interface ResourceTableProps<T> {
  title: string;
  description?: string;
  ariaLabel: string;
  items: T[];
  columns: Array<ResourceTableColumn<T>>;
  getRowId: (item: T) => string;
  renderActions?: (item: T) => ReactNode;
  toolbar?: ReactNode;
  filters?: ReactNode;
  isLoading?: boolean;
  error?: string | null;
  emptyState: ResourceTableEmptyState;
  onRetry?: () => void;
  defaultSort?: { columnId: string; direction?: SortDirection };
  onSortChange?: (sort: { columnId: string; direction: SortDirection }) => void;
  onRowClick?: (item: T) => void;
  getRowAriaLabel?: (item: T) => string;
  getRowDescription?: (item: T) => string | null | undefined;
}

function normalizeValue(value: string | number | Date | boolean | null | undefined): number | string {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return Number(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).toLocaleLowerCase();
}

function resolveEmptyState(emptyState: ResourceTableEmptyState): ReactNode {
  if (typeof emptyState === 'object' && emptyState && 'title' in emptyState) {
    return (
      <div className="resource-table__empty-card" role="note">
        {emptyState.illustration ? (
          <div className="resource-table__empty-illustration" aria-hidden="true">
            {emptyState.illustration}
          </div>
        ) : null}
        <h3>{emptyState.title}</h3>
        {emptyState.description ? <p>{emptyState.description}</p> : null}
        {emptyState.action ? <div className="resource-table__empty-action">{emptyState.action}</div> : null}
      </div>
    );
  }

  return <div className="resource-table__empty-card">{emptyState}</div>;
}

export default function ResourceTable<T>({
  title,
  description,
  ariaLabel,
  items,
  columns,
  getRowId,
  renderActions,
  toolbar,
  filters,
  isLoading = false,
  error = null,
  emptyState,
  onRetry,
  defaultSort,
  onSortChange,
  onRowClick,
  getRowAriaLabel,
  getRowDescription,
}: ResourceTableProps<T>) {
  const headingId = `${title.replace(/\s+/g, '-').toLowerCase()}-heading`;
  const descriptionId = description ? `${headingId}-description` : undefined;
  const statusId = `${headingId}-status`;

  const [sortState, setSortState] = useState<{ columnId: string; direction: SortDirection } | null>(() =>
    defaultSort ? { columnId: defaultSort.columnId, direction: defaultSort.direction ?? 'asc' } : null,
  );

  const sortedItems = useMemo(() => {
    if (!sortState) {
      return items;
    }

    const column = columns.find((candidate) => candidate.id === sortState.columnId);
    if (!column || !column.sortable || !column.sortAccessor) {
      return items;
    }

    const directionMultiplier = sortState.direction === 'asc' ? 1 : -1;

    return [...items].sort((a, b) => {
      const aValue = normalizeValue(column.sortAccessor?.(a));
      const bValue = normalizeValue(column.sortAccessor?.(b));

      if (aValue < bValue) {
        return -1 * directionMultiplier;
      }
      if (aValue > bValue) {
        return 1 * directionMultiplier;
      }
      return 0;
    });
  }, [columns, items, sortState]);

  const showEmptyState = !isLoading && !error && sortedItems.length === 0;
  const status: ResourceTableStatus = error
    ? 'error'
    : isLoading
      ? 'loading'
      : showEmptyState
        ? 'empty'
        : 'default';

  function handleSort(column: ResourceTableColumn<T>): void {
    if (!column.sortable || !column.sortAccessor) {
      return;
    }

    setSortState((current) => {
      const isSameColumn = current?.columnId === column.id;
      const nextDirection: SortDirection = isSameColumn && current?.direction === 'asc' ? 'desc' : 'asc';
      const nextState = { columnId: column.id, direction: nextDirection };
      onSortChange?.(nextState);
      return nextState;
    });
  }

  return (
    <section
      className="resource-table"
      data-status={status !== 'default' ? status : undefined}
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      aria-busy={status === 'loading'}
    >
      <header className="resource-table__header">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? (
            <p id={descriptionId} className="resource-table__description">
              {description}
            </p>
          ) : null}
        </div>
        {toolbar ? <div className="resource-table__toolbar">{toolbar}</div> : null}
      </header>

      {filters ? <div className="resource-table__filters">{filters}</div> : null}

      <div id={statusId} className="resource-table__status" aria-live="polite">
        {status === 'error' ? (
          <div className="resource-table__error" role="alert">
            <span>{error}</span>
            {onRetry ? (
              <button type="button" className="resource-table__retry" onClick={onRetry}>
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

        {status === 'loading' ? (
          <div className="resource-table__loading" role="status" aria-live="polite">
            <span className="resource-table__loading-bar" aria-hidden="true" />
            Carregando dados…
          </div>
        ) : null}
      </div>

      {showEmptyState ? (
        <div className="resource-table__empty" role="note">
          {resolveEmptyState(emptyState)}
        </div>
      ) : (
        <div className="resource-table__scroll" role="region" aria-live="polite">
          <table className="resource-table__table" aria-label={ariaLabel} aria-describedby={statusId}>
            <thead>
              <tr>
                {columns.map((column) => {
                  const isSortedColumn = sortState?.columnId === column.id;
                  const ariaSort = isSortedColumn ? (sortState?.direction === 'asc' ? 'ascending' : 'descending') : undefined;
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      className={clsx(column.align && `resource-table__cell--${column.align}`)}
                      aria-sort={ariaSort}
                    >
                      {column.sortable && column.sortAccessor ? (
                        <button
                          type="button"
                          className={clsx('resource-table__sort-button', isSortedColumn && 'is-active')}
                          onClick={() => handleSort(column)}
                          aria-label={column.sortAriaLabel ?? `Ordenar por ${column.header}`}
                        >
                          <span>{column.header}</span>
                          <span aria-hidden="true" className="resource-table__sort-icon">
                            {isSortedColumn && sortState?.direction === 'desc' ? '▾' : '▴'}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
                {renderActions ? <th scope="col" className="resource-table__actions-header">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const rowId = getRowId(item);
                const rowLabel = getRowAriaLabel?.(item);
                const rowDescription = getRowDescription?.(item);
                const clickable = Boolean(onRowClick);
                const rowDescriptionId = rowDescription ? `${rowId}-description` : undefined;

                return (
                  <tr
                    key={rowId}
                    tabIndex={clickable ? 0 : undefined}
                    role={clickable ? 'button' : undefined}
                    aria-label={clickable ? rowLabel : undefined}
                    aria-describedby={clickable ? rowDescriptionId : undefined}
                    data-clickable={clickable || undefined}
                    onClick={clickable ? () => onRowClick?.(item) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick?.(item);
                            }
                          }
                        : undefined
                    }
                  >
                    {columns.map((column, columnIndex) => (
                      <td key={column.id} className={clsx(column.align && `resource-table__cell--${column.align}`)}>
                        {columnIndex === 0 && rowDescription ? (
                          <span className="resource-table__sr" id={rowDescriptionId}>
                            {rowDescription}
                          </span>
                        ) : null}
                        {column.render(item)}
                      </td>
                    ))}
                    {renderActions ? (
                      <td className="resource-table__actions">{renderActions(item)}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
