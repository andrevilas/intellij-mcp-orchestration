import type { ReactNode } from 'react';

export interface ResourceTableColumn<T> {
  id: string;
  header: string;
  render: (item: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

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
  emptyState: ReactNode;
  onRetry?: () => void;
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
}: ResourceTableProps<T>) {
  const showEmptyState = !isLoading && !error && items.length === 0;

  return (
    <section className="resource-table" aria-labelledby={`${title.replace(/\s+/g, '-').toLowerCase()}-heading`}>
      <header className="resource-table__header">
        <div>
          <h2 id={`${title.replace(/\s+/g, '-').toLowerCase()}-heading`}>{title}</h2>
          {description ? <p className="resource-table__description">{description}</p> : null}
        </div>
        {toolbar ? <div className="resource-table__toolbar">{toolbar}</div> : null}
      </header>

      {filters ? <div className="resource-table__filters">{filters}</div> : null}

      {error ? (
        <div className="resource-table__error" role="alert">
          <span>{error}</span>
          {onRetry ? (
            <button type="button" className="resource-table__retry" onClick={onRetry}>
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="resource-table__loading" role="status" aria-live="polite">
          Carregando dados...
        </div>
      ) : null}

      {showEmptyState ? (
        <div className="resource-table__empty" role="note">
          {emptyState}
        </div>
      ) : (
        <div className="resource-table__scroll" role="region" aria-live="polite">
          <table className="resource-table__table" aria-label={ariaLabel}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={column.align ? `resource-table__cell--${column.align}` : undefined}
                  >
                    {column.header}
                  </th>
                ))}
                {renderActions ? <th scope="col" className="resource-table__actions-header">Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rowId = getRowId(item);
                return (
                  <tr key={rowId}>
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={column.align ? `resource-table__cell--${column.align}` : undefined}
                      >
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
