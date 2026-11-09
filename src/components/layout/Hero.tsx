import { motion, useReducedMotion } from 'motion/react';

function CrossfadeMotif() {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      className="crossfade-motif"
      viewBox="0 0 360 220"
      role="img"
      aria-label="Diagram of two signals crossing in a 180 millisecond crossfade"
    >
      <defs>
        <linearGradient id="motif-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="motif-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--text)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--text)" stopOpacity="0.8" />
        </linearGradient>
      </defs>

      <g className="crossfade-motif__grid" aria-hidden="true">
        <path d="M24 40H336" />
        <path d="M24 80H336" />
        <path d="M24 120H336" />
        <path d="M24 160H336" />
      </g>

      <motion.path
        d="M24 44C120 44 138 176 180 176C222 176 240 44 336 44"
        fill="none"
        stroke="url(#motif-a)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.path
        d="M24 176C120 176 138 44 180 44C222 44 240 176 336 176"
        fill="none"
        stroke="url(#motif-b)"
        strokeWidth="2"
        strokeLinecap="round"
        initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          duration: reduceMotion ? 0 : 1.1,
          delay: reduceMotion ? 0 : 0.12,
          ease: [0.16, 1, 0.3, 1],
        }}
      />

      <circle cx="180" cy="110" r="3" fill="var(--accent)" />
      <circle cx="180" cy="110" r="11" fill="none" stroke="var(--accent)" strokeOpacity="0.25" />

      <text x="24" y="204" className="crossfade-motif__label">
        A — ORIGINAL
      </text>
      <text x="336" y="204" textAnchor="end" className="crossfade-motif__label">
        B — EDITED
      </text>
    </svg>
  );
}

export function Hero() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="hero" aria-labelledby="hero-title">
      <motion.div
        className="hero__copy"
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="eyebrow">
          <span className="eyebrow__rule" aria-hidden="true" />
          A/B listening room
        </p>
        <h1 className="display" id="hero-title">
          Hear the <em>difference.</em>
        </h1>
        <p className="lede">
          Two versions of the same recording, one synchronized timeline. Switch between Original and
          Edited mid-play and a real crossfade carries you across without losing your place.
        </p>

        <ul className="hero__facts" aria-label="Product facts">
          <li>180 ms default crossfade</li>
          <li>80–600 ms transition</li>
          <li>Files stay on this device</li>
          <li>No account</li>
        </ul>
      </motion.div>

      <motion.figure
        className="hero__figure"
        initial={reduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.6,
          delay: reduceMotion ? 0 : 0.1,
          ease: [0.16, 1, 0.3, 1],
        }}
      >
        <CrossfadeMotif />
        <figcaption className="hero__figcaption">
          <span>Gain A</span>
          <span className="hero__figcaption-arrow" aria-hidden="true">
            →
          </span>
          <span>Gain B</span>
        </figcaption>
      </motion.figure>
    </section>
  );
}
