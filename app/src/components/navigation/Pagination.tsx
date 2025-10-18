import clsx from 'clsx';

interface PaginationProps {
  currentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function Pagination({
  currentPage,
  pageCount,
  onPageChange,
  ariaLabel = 'Paginação',
}: PaginationProps): JSX.Element | null {
  if (pageCount <= 1) {
    return null;
  }

  const normalizedCurrent = clamp(currentPage, 1, pageCount);

  const goTo = (target: number) => {
    const next = clamp(target, 1, pageCount);
    if (next !== normalizedCurrent) {
      onPageChange(next);
    }
  };

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <nav aria-label={ariaLabel}>
      <ul className="pagination mb-0">
        <li className={clsx('page-item', { disabled: normalizedCurrent === 1 })}>
          <button
            type="button"
            className="page-link"
            onClick={() => goTo(normalizedCurrent - 1)}
            aria-label="Página anterior"
            disabled={normalizedCurrent === 1}
          >
            Anterior
          </button>
        </li>
        {pages.map((page) => (
          <li key={page} className={clsx('page-item', { active: page === normalizedCurrent })}>
            <button
              type="button"
              className="page-link"
              onClick={() => goTo(page)}
              aria-current={page === normalizedCurrent ? 'page' : undefined}
            >
              {page}
            </button>
          </li>
        ))}
        <li className={clsx('page-item', { disabled: normalizedCurrent === pageCount })}>
          <button
            type="button"
            className="page-link"
            onClick={() => goTo(normalizedCurrent + 1)}
            aria-label="Próxima página"
            disabled={normalizedCurrent === pageCount}
          >
            Próximo
          </button>
        </li>
      </ul>
    </nav>
  );
}
