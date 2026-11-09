import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Stagger delay between child reveals, in ms. */
  staggerChildren?: number;
  /** Entrance duration, in ms. */
  duration?: number;
  /** When true, animate once when the element enters the viewport; false = on mount. */
  viewport?: boolean;
  className?: string;
}

/**
 * A single-element reveal. Respects reduced motion by appearing immediately
 * without any travel animation.
 */
export function Reveal({
  children,
  staggerChildren = 0,
  duration = 480,
  viewport = true,
  className,
  ...props
}: RevealProps) {
  const reduceMotion = useReducedMotion();

  const variants = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: duration / 1000,
            ease: [0.16, 1, 0.3, 1] as const,
            ...(staggerChildren > 0 ? { staggerChildren: staggerChildren / 1000 } : {}),
          },
        },
      };

  return (
    <motion.div
      className={className}
      {...props}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion ? 'visible' : 'visible'}
      variants={variants}
      transition={{
        duration: reduceMotion ? 0 : duration / 1000,
        ease: [0.16, 1, 0.3, 1] as const,
      }}
      viewport={viewport ? { once: true, margin: '-12%' } : undefined}
    >
      {children}
    </motion.div>
  );
}
