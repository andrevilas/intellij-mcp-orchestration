import clsx from 'clsx';
import { Fragment } from 'react';

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
    return <nav aria-label="Trilha de navegação" className={className} />;
  }

  return (
    <nav aria-label="Trilha de navegação" className={className}>
      <ol className="breadcrumb align-items-center mb-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const content = item.href && !isLast ? (
            <a className="breadcrumb-link" href={item.href} aria-current={item.isCurrent ? 'page' : undefined}>
              {item.label}
            </a>
          ) : (
            <span className="breadcrumb-text" aria-current={item.isCurrent || isLast ? 'page' : undefined}>
              {item.label}
            </span>
          );

          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className={clsx('breadcrumb-item', { active: isLast || item.isCurrent })}>{content}</li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
