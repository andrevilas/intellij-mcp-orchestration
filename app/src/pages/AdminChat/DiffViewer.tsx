import type { AdminPlanDiff } from '../../api';

interface DiffViewerProps {
  diffs: AdminPlanDiff[];
}

export default function DiffViewer({ diffs }: DiffViewerProps) {
  if (diffs.length === 0) {
    return (
      <section className="diff-viewer">
        <h2 className="diff-viewer__title">Diffs sugeridos</h2>
        <p className="diff-viewer__placeholder">Nenhuma alteração pendente no momento.</p>
      </section>
    );
  }

  return (
    <section className="diff-viewer">
      <h2 className="diff-viewer__title">Diffs sugeridos</h2>
      <ul className="diff-viewer__list">
        {diffs.map((diff) => (
          <li key={diff.id} className="diff-viewer__item">
            <header className="diff-viewer__item-header">
              <span className="diff-viewer__item-file">{diff.file}</span>
              <span className="diff-viewer__item-summary">{diff.summary}</span>
            </header>
            <pre className="diff-viewer__content" aria-label={`Diff para ${diff.file}`}>
              <code>{diff.diff}</code>
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
