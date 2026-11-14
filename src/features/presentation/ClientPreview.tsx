import { EyeOff, ShieldCheck } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { ComparisonWorkspace } from '../comparison/ComparisonWorkspace';

export function ClientPreview() {
  const { activeWorkspace, exitPreview } = useWorkspace();

  if (!activeWorkspace) {
    return null;
  }

  return (
    <div className="client-preview" role="region" aria-label="Local client preview">
      <div className="client-preview__banner">
        <div className="client-preview__banner-content">
          <ShieldCheck size={18} className="client-preview__banner-icon" aria-hidden="true" />
          <div>
            <p className="client-preview__banner-title">
              Local preview — this view has not been shared
            </p>
            <p className="client-preview__banner-subtitle">
              No URL or cloud project was created. Your audio stays in this browser tab.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="client-preview__exit-btn"
          onClick={exitPreview}
          aria-label="Exit preview"
        >
          <EyeOff size={15} aria-hidden="true" />
          <span>Exit preview</span>
        </button>
      </div>

      <div className="client-preview__content">
        <ComparisonWorkspace
          workspace={activeWorkspace}
          layout={activeWorkspace.presentationLayout}
          readOnly={true}
        />
      </div>
    </div>
  );
}
