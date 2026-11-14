import { AudioLines, Columns2, LayoutGrid, Sliders } from 'lucide-react';
import type { PresentationLayout } from '../../workspaces/workspaceTypes';

interface LayoutOption {
  id: PresentationLayout;
  label: string;
  icon: typeof LayoutGrid;
  description: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: 'standard',
    label: 'Standard',
    icon: Columns2,
    description: 'Balanced player and waveform view',
  },
  {
    id: 'player-focused',
    label: 'Player',
    icon: Sliders,
    description: 'Dominant transport and version switch',
  },
  {
    id: 'waveform-focused',
    label: 'Waveform',
    icon: AudioLines,
    description: 'Expanded waveform lanes with deep time axis',
  },
  {
    id: 'compact-review',
    label: 'Compact',
    icon: LayoutGrid,
    description: 'Tighter review layout with compact controls',
  },
];

export function PresentationLayoutSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: PresentationLayout;
  onChange: (layout: PresentationLayout) => void;
  disabled?: boolean;
}) {
  return (
    <div className="layout-selector" role="radiogroup" aria-label="Presentation layout mode">
      {LAYOUT_OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.id;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${option.label} layout: ${option.description}`}
            title={`${option.label} — ${option.description}`}
            className={`layout-selector__btn${isSelected ? ' layout-selector__btn--active' : ''}`}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            <Icon size={15} aria-hidden="true" />
            <span className="layout-selector__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
