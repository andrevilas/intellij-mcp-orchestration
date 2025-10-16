import { useId } from 'react';

export interface JsonEditorProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
  placeholder?: string;
  error?: string | null;
  rows?: number;
  disabled?: boolean;
}

function formatJson(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return JSON.stringify({}, null, 2);
  }

  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

export default function JsonEditor({
  id,
  label,
  value,
  onChange,
  description,
  placeholder,
  error,
  rows = 10,
  disabled = false,
}: JsonEditorProps): JSX.Element {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const descriptionId = description ? `${editorId}-description` : undefined;
  const errorId = error ? `${editorId}-error` : undefined;

  const handleFormat = () => {
    const formatted = formatJson(value);
    if (formatted !== null) {
      onChange(formatted);
    }
  };

  return (
    <div className="json-editor">
      <div className="json-editor__header">
        <label className="json-editor__label" htmlFor={editorId}>
          <span className="json-editor__label-text">{label}</span>
          {description ? (
            <span className="json-editor__description" id={descriptionId}>
              {description}
            </span>
          ) : null}
        </label>
        <button
          type="button"
          className="json-editor__format"
          onClick={handleFormat}
          disabled={disabled}
        >
          Formatar
        </button>
      </div>
      <textarea
        id={editorId}
        className={error ? 'json-editor__textarea json-editor__textarea--error' : 'json-editor__textarea'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
        disabled={disabled}
        spellCheck={false}
      />
      {error ? (
        <p className="json-editor__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
