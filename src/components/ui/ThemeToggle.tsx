import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import type { ThemeMode } from '../../app/theme';

const OPTIONS: ReadonlyArray<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'system', label: 'System', Icon: Monitor },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'light', label: 'Light', Icon: Sun },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(({ mode: option, label, Icon }) => {
        const active = mode === option;

        return (
          <button
            key={option}
            type="button"
            className="theme-option"
            aria-pressed={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setMode(option)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="theme-option__label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
