import clsx from 'clsx';

import './pagination.scss';

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
    <nav aria-label={ariaLabel} className="pagination">
      <ul className="pagination__list">
        <li
          className={clsx('pagination__item', {
            'pagination__item--disabled': normalizedCurrent === 1,
          })}
        >
          <button
            type="button"
            className="pagination__button"
            onClick={() => goTo(normalizedCurrent - 1)}
            aria-label="Página anterior"
            disabled={normalizedCurrent === 1}
          >
            Anterior
          </button>
        </li>
        {pages.map((page) => (
          <li
            key={page}
            className={clsx('pagination__item', {
              'pagination__item--active': page === normalizedCurrent,
            })}
          >
            <button
              type="button"
              className="pagination__button"
              onClick={() => goTo(page)}
              aria-current={page === normalizedCurrent ? 'page' : undefined}
            >
              {page}
            </button>
          </li>
        ))}
        <li
          className={clsx('pagination__item', {
            'pagination__item--disabled': normalizedCurrent === pageCount,
          })}
        >
          <button
            type="button"
            className="pagination__button"
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
