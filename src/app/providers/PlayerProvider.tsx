import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { PlayerContext } from './playerContext';

export function PlayerProvider({
  children,
  engine: providedEngine,
}: {
  children: ReactNode;
  engine?: ABAudioEngine;
}) {
  const [engine] = useState<ABAudioEngine>(() => providedEngine ?? new ABAudioEngine());
  const [ownsEngine] = useState(() => providedEngine === undefined);
  const disposeTimer = useRef<number | null>(null);

  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  useEffect(() => {
    if (import.meta.env.DEV) {
      window.__switchroom = { engine, getContext: () => engine.getAudioContext() };
    }

    return () => {
      if (window.__switchroom?.engine === engine) {
        delete window.__switchroom;
      }
    };
  }, [engine]);

  useEffect(() => {
    // React StrictMode mounts, unmounts and remounts in development. Deferring
    // disposal lets the remount reuse the engine and still releases resources
    // on a real unmount.
    if (disposeTimer.current !== null) {
      window.clearTimeout(disposeTimer.current);
      disposeTimer.current = null;
    }

    return () => {
      if (!ownsEngine) {
        return;
      }

      disposeTimer.current = window.setTimeout(() => {
        disposeTimer.current = null;
        engine.dispose();
      }, 0);
    };
  }, [engine, ownsEngine]);

  return <PlayerContext.Provider value={{ engine, snapshot }}>{children}</PlayerContext.Provider>;
}
