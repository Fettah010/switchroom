import type { ABAudioEngine } from '../audio/ABAudioEngine';
import { ThemeProvider } from './providers/ThemeProvider';
import { PlayerProvider } from './providers/PlayerProvider';
import { TopBar } from '../components/layout/TopBar';
import { Reveal } from '../components/motion/Reveal';
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
            <Reveal className="site-header-wrap" viewport={false}>
              <TopBar />
            </Reveal>

            <main id="main">
              <Hero />
              <ComparisonWorkspace />
            </main>

            <Reveal viewport duration={320}>
              <Footer />
            </Reveal>
          </div>
        </div>
      </PlayerProvider>
    </ThemeProvider>
  );
}
