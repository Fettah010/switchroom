import type { ABAudioEngine } from '../audio/ABAudioEngine';
import { ThemeProvider } from './providers/ThemeProvider';
import { PlayerProvider } from './providers/PlayerProvider';
import { TopBar } from '../components/layout/TopBar';
import { Hero } from '../components/layout/Hero';
import { PageAtmosphere } from '../components/layout/PageAtmosphere';
import { Footer } from '../components/layout/Footer';
import { ComparisonWorkspace } from '../features/comparison/ComparisonWorkspace';

export function App({ engine }: { engine?: ABAudioEngine }) {
  return (
    <ThemeProvider>
      <PlayerProvider engine={engine}>
        <a className="skip-link" href="#main">
          Skip to comparison
        </a>

        <div className="page">
          <PageAtmosphere />

          <div className="page__content">
            <TopBar />

            <main id="main">
              <Hero />
              <ComparisonWorkspace />
            </main>

            <Footer />
          </div>
        </div>
      </PlayerProvider>
    </ThemeProvider>
  );
}
