import type { ReactNode } from 'react';

export interface PlanDiffItem {
  id: string;
  title: string;
  summary?: string;
  diff?: string | null;
}

interface PlanDiffViewerProps {
  diffs: PlanDiffItem[];
  title?: string;
  emptyMessage?: ReactNode;
}

const DEFAULT_EMPTY_MESSAGE = 'Nenhuma alteração pendente no momento.';

export default function PlanDiffViewer({
  diffs,
  title = 'Diffs sugeridos',
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
}: PlanDiffViewerProps) {
  if (diffs.length === 0) {
    return (
      <section className="diff-viewer">
        <h2 className="diff-viewer__title">{title}</h2>
        <p className="diff-viewer__placeholder">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section className="diff-viewer">
      <h2 className="diff-viewer__title">{title}</h2>
      <ul className="diff-viewer__list">
        {diffs.map((diff) => (
          <li key={diff.id} className="diff-viewer__item">
            <header className="diff-viewer__item-header">
              <span className="diff-viewer__item-file">{diff.title}</span>
              {diff.summary ? (
                <span className="diff-viewer__item-summary">{diff.summary}</span>
              ) : null}
            </header>
            {diff.diff ? (
              <pre className="diff-viewer__content" aria-label={`Diff para ${diff.title}`}>
                <code>{diff.diff}</code>
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
