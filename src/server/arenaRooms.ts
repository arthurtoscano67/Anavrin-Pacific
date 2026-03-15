export type BattleRoomStatus = 'lobby' | 'room' | 'battle' | 'complete';

export type BattleRoomRecord = {
  roomId: string;
  playerA: string;
  playerB: string;
  monsterA?: string;
  monsterB?: string;
  readyA: boolean;
  readyB: boolean;
  wager: string;
  status: BattleRoomStatus;
};

export const ACTIVE_ARENA_ROOM_STORAGE_KEY = 'activeArenaRoomId';

export function generateBattleRoomId(playerA: string, playerB: string, timestamp = Date.now()): string {
  const clean = (value: string) => value.toLowerCase().replace(/^0x/, '');
  return `${clean(playerA)}_${clean(playerB)}_${timestamp.toString(36)}`;
}

export function normalizeBattleRoomId(roomId?: string | null): string {
  return (roomId ?? '').trim().toLowerCase();
}

export function createBattleRoomRecord(input: {
  roomId: string;
  playerA: string;
  playerB: string;
  wager?: string;
}): BattleRoomRecord {
  return {
    roomId: input.roomId,
    playerA: input.playerA,
    playerB: input.playerB,
    readyA: false,
    readyB: false,
    wager: input.wager ?? '0',
    status: 'room',
  };
}
