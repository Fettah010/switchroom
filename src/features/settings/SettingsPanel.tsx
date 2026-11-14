import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Moon, Sun, Monitor, Trash2, X } from 'lucide-react';
import { usePreferences } from '../../hooks/usePreferences';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useTheme } from '../../hooks/useTheme';
import { PresentationLayoutSelector } from '../presentation/PresentationLayoutSelector';
import { RangeControl } from '../../components/ui/RangeControl';
import { MIN_CROSSFADE_MS, MAX_CROSSFADE_MS } from '../../audio/crossfade';
import type { ThemeMode } from '../../app/theme';

export function SettingsPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { preferences, updatePreferences } = usePreferences();
  const { clearAllData } = useWorkspace();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();

  const [confirmingClear, setConfirmingClear] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      panelRef.current?.focus();
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  async function handleConfirmClear() {
    await clearAllData();
    setConfirmingClear(false);
    onClose();
  }

  return (
    <div className="settings-overlay">
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close settings overlay"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
      >
        <div className="settings-modal__header">
          <h2 className="settings-modal__title" id="settings-title">
            Settings
          </h2>
          <button
            type="button"
            className="settings-modal__close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="settings-modal__body">
          {/* Theme setting */}
          <section className="settings-group" aria-labelledby="setting-theme-title">
            <h3 className="settings-group__title" id="setting-theme-title">
              Theme
            </h3>
            <div className="settings-segment" role="radiogroup" aria-label="Theme mode">
              {(
                [
                  { id: 'system', label: 'System', icon: Monitor },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'light', label: 'Light', icon: Sun },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const isSelected = themeMode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`settings-segment__btn${isSelected ? ' settings-segment__btn--active' : ''}`}
                    onClick={() => setThemeMode(item.id as ThemeMode)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Motion preference */}
          <section className="settings-group" aria-labelledby="setting-motion-title">
            <h3 className="settings-group__title" id="setting-motion-title">
              Motion
            </h3>
            <p className="settings-group__desc">
              Controls interface animations. If your operating system requests reduced motion, it is
              always respected.
            </p>
            <div className="settings-segment" role="radiogroup" aria-label="Motion preference">
              <button
                type="button"
                role="radio"
                aria-checked={preferences.motionPreference === 'system'}
                className={`settings-segment__btn${preferences.motionPreference === 'system' ? ' settings-segment__btn--active' : ''}`}
                onClick={() => updatePreferences({ motionPreference: 'system' })}
              >
                <span>System</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={preferences.motionPreference === 'reduced'}
                className={`settings-segment__btn${preferences.motionPreference === 'reduced' ? ' settings-segment__btn--active' : ''}`}
                onClick={() => updatePreferences({ motionPreference: 'reduced' })}
              >
                <span>Reduced</span>
              </button>
            </div>
          </section>

          {/* Default Crossfade */}
          <section className="settings-group" aria-labelledby="setting-crossfade-title">
            <div className="settings-group__header-row">
              <h3 className="settings-group__title" id="setting-crossfade-title">
                Default crossfade
              </h3>
              <span className="settings-group__value">{preferences.defaultCrossfadeMs} ms</span>
            </div>
            <p className="settings-group__desc">
              Applied when creating a new comparison. Saved workspaces keep their custom duration.
            </p>
            <RangeControl
              value={preferences.defaultCrossfadeMs}
              progress={
                (preferences.defaultCrossfadeMs - MIN_CROSSFADE_MS) /
                (MAX_CROSSFADE_MS - MIN_CROSSFADE_MS)
              }
              min={MIN_CROSSFADE_MS}
              max={MAX_CROSSFADE_MS}
              step={20}
              aria-label="Default crossfade duration for new workspaces"
              onChange={(e) => updatePreferences({ defaultCrossfadeMs: Number(e.target.value) })}
            />
          </section>

          {/* Default Presentation Layout */}
          <section className="settings-group" aria-labelledby="setting-layout-title">
            <h3 className="settings-group__title" id="setting-layout-title">
              Default presentation layout
            </h3>
            <p className="settings-group__desc">The starting layout for new comparisons.</p>
            <PresentationLayoutSelector
              value={preferences.defaultPresentationLayout}
              onChange={(layout) => updatePreferences({ defaultPresentationLayout: layout })}
            />
          </section>

          {/* Clear local workspaces */}
          <section
            className="settings-group settings-group--danger"
            aria-labelledby="setting-danger-title"
          >
            <h3 className="settings-group__title" id="setting-danger-title">
              Local data
            </h3>
            <p className="settings-group__desc">
              Clear all local comparison metadata and reset settings stored in this browser. Your
              actual audio files on disk will never be touched.
            </p>

            {!confirmingClear ? (
              <button type="button" className="danger-btn" onClick={() => setConfirmingClear(true)}>
                <Trash2 size={15} aria-hidden="true" />
                <span>Clear local workspaces</span>
              </button>
            ) : (
              <div className="settings-modal__confirm-box" role="alert">
                <div className="settings-modal__confirm-header">
                  <AlertTriangle
                    size={16}
                    className="settings-modal__confirm-icon"
                    aria-hidden="true"
                  />
                  <span>Are you sure? This deletes saved workspaces from this browser.</span>
                </div>
                <div className="settings-modal__confirm-actions">
                  <button type="button" className="danger-btn" onClick={handleConfirmClear}>
                    Yes, clear local data
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setConfirmingClear(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
