import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import classNames from 'classnames';
import type { MouseEvent } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onChange?: (page: number) => void;
  className?: string;
}

function buildPages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  pages.add(current);
  pages.add(current - 1);
  pages.add(current + 1);

  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const page = sorted[index];
    if (index > 0 && page - sorted[index - 1] > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }
  return result;
}

export default function Pagination({ currentPage, totalPages, onChange, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const handleChange = (event: MouseEvent<HTMLButtonElement>, page: number) => {
    event.preventDefault();
    if (page === currentPage || page < 1 || page > totalPages) {
      return;
    }
    onChange?.(page);
  };

  const pages = buildPages(currentPage, totalPages);

  return (
    <nav className={classNames(className)} aria-label="Paginação de resultados">
      <ul className="pagination mb-0 align-items-center">
        <li className={classNames('page-item', { disabled: currentPage === 1 })}>
          <button
            type="button"
            className="page-link d-flex align-items-center gap-2"
            onClick={(event) => handleChange(event, currentPage - 1)}
            aria-label="Página anterior"
            disabled={currentPage === 1}
          >
            <FontAwesomeIcon icon={['fas', 'chevron-left']} />
          </button>
        </li>
        {pages.map((page, index) =>
          page === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} className="page-item disabled" aria-hidden="true">
              <span className="page-link">&hellip;</span>
            </li>
          ) : (
            <li key={page} className={classNames('page-item', { active: page === currentPage })}>
              <button
                type="button"
                className="page-link"
                aria-label={`Ir para página ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
                onClick={(event) => handleChange(event, page)}
              >
                {page}
              </button>
            </li>
          ),
        )}
        <li className={classNames('page-item', { disabled: currentPage === totalPages })}>
          <button
            type="button"
            className="page-link d-flex align-items-center gap-2"
            onClick={(event) => handleChange(event, currentPage + 1)}
            aria-label="Próxima página"
            disabled={currentPage === totalPages}
          >
            <FontAwesomeIcon icon={['fas', 'chevron-right']} />
          </button>
        </li>
        <li className="ms-3 text-muted small" aria-live="polite">
          <span>
            Página {currentPage} de {totalPages}
          </span>
        </li>
      </ul>
    </nav>
  );
}
