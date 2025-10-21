import clsx from 'clsx';
import { Fragment } from 'react';

import './breadcrumbs.scss';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps): JSX.Element {
  if (items.length === 0) {
    return <nav aria-label="Trilha de navegação" className={clsx('breadcrumbs', className)} />;
  }

  return (
    <nav aria-label="Trilha de navegação" className={clsx('breadcrumbs', className)}>
      <ol className="breadcrumbs__list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const content = item.href && !isLast ? (
            <a
              className="breadcrumbs__link"
              href={item.href}
              aria-current={item.isCurrent ? 'page' : undefined}
            >
              {item.label}
            </a>
          ) : (
            <span
              className="breadcrumbs__text"
              aria-current={item.isCurrent || isLast ? 'page' : undefined}
            >
              {item.label}
            </span>
          );

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li
                className={clsx('breadcrumbs__item', {
                  'breadcrumbs__item--active': isLast || item.isCurrent,
                })}
              >
                {content}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
