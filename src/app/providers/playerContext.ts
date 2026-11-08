import { createContext } from 'react';
import type { ABAudioEngine } from '../../audio/ABAudioEngine';
import type { ABPlayerSnapshot } from '../../audio/audioTypes';

export interface PlayerContextValue {
  engine: ABAudioEngine;
  snapshot: ABPlayerSnapshot;
}

export const PlayerContext = createContext<PlayerContextValue | null>(null);
