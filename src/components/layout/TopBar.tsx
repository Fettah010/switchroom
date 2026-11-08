import { ThemeToggle } from '../ui/ThemeToggle';

function Wordmark() {
  return (
    <svg
      className="wordmark__mark"
      viewBox="0 0 32 32"
      width="26"
      height="26"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 22C10 22 11 10 16 10C21 10 22 22 28 22"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 10C10 10 11 22 16 22C21 22 22 10 28 10"
        fill="none"
        stroke="var(--text)"
        strokeOpacity="0.45"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="1.6" fill="var(--accent)" />
    </svg>
  );
}

export function TopBar() {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Switchroom home">
        <Wordmark />
        <span className="wordmark__text">Switchroom</span>
      </a>

      <div className="site-header__tools">
        <span className="local-badge">
          <span className="local-badge__dot" aria-hidden="true" />
          <span className="local-badge__label">Local-only</span>
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
