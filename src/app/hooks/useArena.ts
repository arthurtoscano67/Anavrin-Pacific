import { useCallback, useState } from 'react';

import type { ArenaScreen } from '../arena/battle-engine/battleEngine';

export function useArena(initialMatchId: string, initialRoomId: string) {
  const [screen, setScreen] = useState<ArenaScreen>(initialMatchId || initialRoomId ? 'room' : 'lobby');
  const [currentMatchId, setCurrentMatchId] = useState(initialMatchId);
  const [currentRoomId, setCurrentRoomId] = useState(initialRoomId);

  const persistRoomId = useCallback((roomId?: string | null) => {
    if (roomId) {
      setCurrentRoomId(roomId);
      return;
    }
    setCurrentRoomId('');
  }, []);

  return {
    screen,
    setScreen,
    currentMatchId,
    setCurrentMatchId,
    currentRoomId,
    setCurrentRoomId,
    persistRoomId,
  };
}
