import { useContext } from 'react';
import { PlayerContext, type PlayerContextValue } from '../app/providers/playerContext';

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);

  if (!context) {
    throw new Error('usePlayer must be used inside PlayerProvider');
  }

  return context;
}
