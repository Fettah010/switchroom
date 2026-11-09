import type { InputHTMLAttributes, ReactNode } from 'react';

/**
 * A native range input with a shared, measured visual skin.
 *
 * The real `<input type="range">` stays on top and keeps all native keyboard,
 * touch and screen-reader behaviour. The visible rail, fill and thumb are plain
 * DOM elements behind it, so the fill can terminate exactly at the thumb centre
 * in every rendering engine instead of relying on pseudo-element geometry.
 *
 * `progress` is a 0–1 fraction. The rail is inset by half a thumb at each end,
 * so the fill width and thumb position are both a percentage of the same rail
 * box. They cannot drift apart at 0 %, 50 % or 100 %.
 */
interface RangeControlProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Current value as a 0–1 fraction of the control's range. */
  progress: number;
  /** Extra class names applied to the wrapper (variants and legacy hooks). */
  wrapperClassName?: string;
  /** Optional content rendered under the rail (for example scale markers). */
  children?: ReactNode;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function RangeControl({
  progress,
  wrapperClassName,
  children,
  className,
  ...inputProps
}: RangeControlProps) {
  const fraction = clampFraction(progress);
  const position = `${fraction * 100}%`;

  return (
    <div
      className={`range-control${wrapperClassName ? ` ${wrapperClassName}` : ''}`}
      data-disabled={inputProps.disabled ? 'true' : undefined}
    >
      <div className="range-control__surface">
        <div className="range-control__rail" aria-hidden="true">
          <span className="range-control__fill" style={{ width: position }} />
          <span className="range-control__thumb" style={{ left: position }} />
        </div>

        <input
          type="range"
          className={`range-control__input${className ? ` ${className}` : ''}`}
          {...inputProps}
        />
      </div>

      {children}
    </div>
  );
}
