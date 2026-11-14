import { AlertTriangle, Check, LoaderCircle } from 'lucide-react';
import type { SaveStatus } from '../../app/providers/workspaceContext';

export function WorkspaceSaveStatus({
  status,
  error,
  onRetry,
}: {
  status: SaveStatus;
  error: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      className={`save-status save-status--${status}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {status === 'saving' && (
        <>
          <LoaderCircle size={14} className="save-status__spinner" aria-hidden="true" />
          <span>Saving…</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <Check size={14} className="save-status__icon" aria-hidden="true" />
          <span>Saved locally</span>
        </>
      )}

      {status === 'unsaved' && (
        <>
          <span className="save-status__dot" aria-hidden="true" />
          <span>Unsaved changes</span>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertTriangle size={14} className="save-status__error-icon" aria-hidden="true" />
          <span title={error ?? undefined}>Could not save locally</span>
          {onRetry && (
            <button
              type="button"
              className="save-status__retry-btn"
              onClick={onRetry}
              aria-label="Retry saving workspace locally"
            >
              Retry
            </button>
          )}
        </>
      )}
    </div>
  );
}
