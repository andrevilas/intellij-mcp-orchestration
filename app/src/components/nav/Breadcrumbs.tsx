import classNames from 'classnames';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

type BreadcrumbRenderable = BreadcrumbItem | { ellipsis: true };

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

function renderItems(items: BreadcrumbRenderable[]) {
  return items.map((item, index) => {
    if ('ellipsis' in item) {
      return (
        <li key={`ellipsis-${index}`} className="breadcrumb-item text-muted" aria-hidden="true">
          &hellip;
        </li>
      );
    }

    const isLast = index === items.length - 1;
    return (
      <li
        key={`${item.label}-${index}`}
        className={classNames('breadcrumb-item', { active: isLast })}
        aria-current={isLast ? 'page' : undefined}
      >
        {isLast || !item.href ? <span>{item.label}</span> : <a href={item.href}>{item.label}</a>}
      </li>
    );
  });
}

export default function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (!items?.length) {
    return null;
  }

  const collapsedItems: BreadcrumbRenderable[] =
    items.length > 2 ? [items[0], { ellipsis: true }, items[items.length - 1]] : [...items];

  return (
    <nav aria-label="Trilha de navegação" className={classNames('mb-3', className)}>
      <ol className="breadcrumb mb-0 d-flex d-sm-none align-items-center text-truncate">
        {renderItems(collapsedItems)}
      </ol>
      <ol className="breadcrumb mb-0 d-none d-sm-flex align-items-center text-truncate">
        {renderItems(items)}
      </ol>
    </nav>
  );
}
