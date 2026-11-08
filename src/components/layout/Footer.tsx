import { ArrowUpRight, CodeXml } from 'lucide-react';

export const REPOSITORY_URL = 'https://github.com/Fettah010/switchroom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__brand">
        <span className="site-footer__name">Switchroom</span>
        <span className="site-footer__version">v0.1.0</span>
      </div>

      <p className="site-footer__note">Built for listening, not uploading.</p>

      <div className="site-footer__links">
        <a href={REPOSITORY_URL} target="_blank" rel="noreferrer noopener">
          <CodeXml size={14} strokeWidth={1.75} aria-hidden="true" />
          Source
          <ArrowUpRight size={12} aria-hidden="true" />
        </a>
        <span className="site-footer__license">MIT licensed</span>
      </div>
    </footer>
  );
}
