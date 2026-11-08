import { useEffect, useState } from 'react';
import { usePlayer } from './usePlayer';

/**
 * Subscribes to the engine's high-frequency clock separately from the main
 * snapshot so only the timeline re-renders while audio is playing.
 */
export function usePlayhead(): number {
  const { engine } = usePlayer();
  const [time, setTime] = useState<number>(() => engine.getSnapshot().currentTime);

  useEffect(() => engine.subscribeToTime(setTime), [engine]);

  return time;
}
