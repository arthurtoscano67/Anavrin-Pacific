import { powerPreview, short } from '../../lib/format';
import type { ArenaMatch, MatchResolution } from '../../lib/types';
import type { RoomParticipant } from '../network/types';

export type ArenaScreen = 'lobby' | 'room' | 'battle';

export type RoomModel = {
  playerSide: 'a' | 'b' | null;
  bothDeposited: boolean;
  playerDeposited: boolean;
  opponentDeposited: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  canStartBattle: boolean;
  heroTitle: string;
  heroHint: string;
  nextActionLabel: string;
  opponentStatusLabel: string;
  yourTaskLabel: string;
  yourTaskDetail: string;
  opponentTaskLabel: string;
  opponentTaskDetail: string;
};

export type BattleFrame = {
  id: string;
  label: string;
  actor: 'left' | 'right' | 'none';
  leftHp: number;
  rightHp: number;
  flash: boolean;
  winnerSide?: 'left' | 'right';
};

export type BattlePreview = {
  leftPower: number;
  rightPower: number;
  winnerSide: 'left' | 'right';
  frames: BattleFrame[];
};

function parseSeed(seed?: string | null): bigint {
  try {
    return BigInt(seed || '0');
  } catch {
    return BigInt(0);
  }
}

function winnerFromStats(match: ArenaMatch): 'left' | 'right' {
  const left = match.monster_a_data;
  const right = match.monster_b_data;
  if (!left || !right) return 'left';

  const leftPower = powerPreview({
    attack: left.attack,
    defense: left.defense,
    speed: left.speed,
    stage: left.stage,
    xp: left.xp,
  });
  const rightPower = powerPreview({
    attack: right.attack,
    defense: right.defense,
    speed: right.speed,
    stage: right.stage,
    xp: right.xp,
  });

  if (leftPower !== rightPower) return leftPower > rightPower ? 'left' : 'right';
  if (left.speed !== right.speed) return left.speed > right.speed ? 'left' : 'right';
  return parseSeed(left.seed) <= parseSeed(right.seed) ? 'left' : 'right';
}

export function buildBattlePreview(match: ArenaMatch | null, resolution?: MatchResolution | null): BattlePreview | null {
  if (!match?.monster_a_data || !match.monster_b_data) return null;

  const leftPower = powerPreview({
    attack: match.monster_a_data.attack,
    defense: match.monster_a_data.defense,
    speed: match.monster_a_data.speed,
    stage: match.monster_a_data.stage,
    xp: match.monster_a_data.xp,
  });
  const rightPower = powerPreview({
    attack: match.monster_b_data.attack,
    defense: match.monster_b_data.defense,
    speed: match.monster_b_data.speed,
    stage: match.monster_b_data.stage,
    xp: match.monster_b_data.xp,
  });

  const winnerSide = resolution
    ? resolution.winner === match.player_a
      ? 'left'
      : 'right'
    : winnerFromStats(match);

  const loserSide = winnerSide === 'left' ? 'right' : 'left';
  const damage = Math.max(28, Math.min(62, 40 + Math.round(Math.abs(leftPower - rightPower) / 6)));
  const loserEndHp = Math.max(0, 100 - damage);

  const frames: BattleFrame[] = [
    {
      id: 'stare-down',
      label: 'Martians lock eyes.',
      actor: 'none',
      leftHp: 100,
      rightHp: 100,
      flash: false,
    },
    {
      id: 'charge',
      label: `${winnerSide === 'left' ? match.monster_a_data.name : match.monster_b_data.name} charges up!`,
      actor: winnerSide,
      leftHp: 100,
      rightHp: 100,
      flash: false,
    },
    {
      id: 'impact',
      label: 'Direct hit!',
      actor: winnerSide,
      leftHp: loserSide === 'left' ? loserEndHp : 100,
      rightHp: loserSide === 'right' ? loserEndHp : 100,
      flash: true,
    },
    {
      id: 'finish',
      label: `${winnerSide === 'left' ? match.monster_a_data.name : match.monster_b_data.name} wins!`,
      actor: winnerSide,
      leftHp: loserSide === 'left' ? loserEndHp : 100,
      rightHp: loserSide === 'right' ? loserEndHp : 100,
      flash: false,
      winnerSide,
    },
  ];

  return { leftPower, rightPower, winnerSide, frames };
}

export function buildRoomModel(input: {
  match: ArenaMatch | null;
  accountAddress?: string | null;
  participants: RoomParticipant[];
  resolution?: MatchResolution | null;
}): RoomModel {
  const { match, accountAddress, participants, resolution } = input;
  const playerSide = match && accountAddress
    ? match.player_a === accountAddress
      ? 'a'
      : match.player_b === accountAddress
        ? 'b'
        : null
    : null;
  const sideAHasMonster = Boolean(match?.mon_a || match?.monster_a_data);
  const sideBHasMonster = Boolean(match?.mon_b || match?.monster_b_data);

  const opponent = accountAddress ? participants.find((participant) => participant.address !== accountAddress) : undefined;

  const playerDeposited = Boolean(match && playerSide && (playerSide === 'a' ? sideAHasMonster : sideBHasMonster));
  const opponentDeposited = Boolean(match && playerSide && (playerSide === 'a' ? sideBHasMonster : sideAHasMonster));
  const bothDeposited = Boolean(sideAHasMonster && sideBHasMonster);
  const canDeposit = Boolean(match && playerSide && match.status === 0 && !playerDeposited);
  const canWithdraw = Boolean(match && playerSide && match.status === 0 && playerDeposited);
  const canStartBattle = Boolean(match && bothDeposited && match.status === 1 && !resolution);

  let heroTitle = 'Pick a trainer.';
  let heroHint = 'Invite a player, accept an invite, and build a room.';
  let nextActionLabel = 'Invite';
  let opponentStatusLabel = opponent?.present ? 'Online' : 'Offline';
  let yourTaskLabel = 'Invite a trainer';
  let yourTaskDetail = 'Start from the lobby and open a room.';
  let opponentTaskLabel = 'Come online';
  let opponentTaskDetail = 'The other trainer needs the arena page open.';

  if (!match && participants.length > 0) {
    if (participants.length === 1) {
      heroTitle = 'Room open.';
      heroHint = 'Keep this room open. The other trainer needs to accept the invite and join.';
      nextActionLabel = 'Wait';
      opponentStatusLabel = opponent?.present ? 'In room' : 'Invite pending';
      yourTaskLabel = 'Wait in room';
      yourTaskDetail = 'Stay here so the room is ready when they accept.';
      opponentTaskLabel = 'Accept invite';
      opponentTaskDetail = 'They need to tap ACCEPT in the lobby first.';
    } else {
      heroTitle = 'Both trainers are here.';
      heroHint = 'Open the on-chain battle room first. Either trainer can tap the next button.';
      nextActionLabel = 'Open room';
      opponentStatusLabel = 'In room';
      yourTaskLabel = 'Open battle room';
      yourTaskDetail = 'Tap the next button once. This creates the on-chain match object.';
      opponentTaskLabel = 'Open battle room';
      opponentTaskDetail = 'Either trainer can do this. Once it opens, both sides deposit.';
    }
  } else if (match && match.status === 3) {
    heroTitle = 'Battle cancelled.';
    heroHint = 'The room was cancelled. Martians should be back with their trainers.';
    nextActionLabel = 'Back to lobby';
    opponentStatusLabel = 'Left room';
    yourTaskLabel = 'Return to lobby';
    yourTaskDetail = 'This room is over. Start a fresh battle from the lobby.';
    opponentTaskLabel = 'Return to lobby';
    opponentTaskDetail = 'The other trainer should also start from the lobby again.';
  } else if (resolution || match?.status === 2) {
    heroTitle = 'Battle finished.';
    heroHint = 'Watch the result and jump into the next fight.';
    nextActionLabel = 'Watch result';
    opponentStatusLabel = 'Fight ended';
    yourTaskLabel = 'See result';
    yourTaskDetail = 'The fight is done and the Martians are back in their wallets.';
    opponentTaskLabel = 'See result';
    opponentTaskDetail = 'The other trainer is also done with this room.';
  } else if (match) {
    if (!playerDeposited) {
      heroTitle = 'Send your Martian.';
      heroHint = 'Your side is empty. Deposit your NFT and set your wager.';
      nextActionLabel = 'Deposit';
      opponentStatusLabel = opponentDeposited ? 'Martian loaded' : opponent?.present ? 'Choosing Martian' : 'Not in room';
      yourTaskLabel = 'Deposit Martian';
      yourTaskDetail = 'Pick your Martian and optional wager, then deposit once.';
      opponentTaskLabel = opponentDeposited ? 'Waiting on you' : opponent?.present ? 'Pick a Martian' : 'Return to room';
      opponentTaskDetail = opponentDeposited
        ? 'They are already deposited. Your deposit is the next step.'
        : opponent?.present
          ? 'They still need to choose and deposit their Martian.'
          : 'They need to reopen the room to continue.';
    } else if (!opponentDeposited) {
      heroTitle = 'Waiting for the other side.';
      heroHint = 'Your Martian is loaded. They still need to deposit theirs. You can withdraw safely until they do.';
      nextActionLabel = 'Wait';
      opponentStatusLabel = opponent?.present ? 'Needs deposit' : 'Left room';
      yourTaskLabel = canWithdraw ? 'Wait or withdraw' : 'Wait for deposit';
      yourTaskDetail = canWithdraw
        ? 'Your Martian is safe in the pool. You can still withdraw before they deposit.'
        : 'Stay in the room until the other trainer deposits.';
      opponentTaskLabel = opponent?.present ? 'Deposit Martian' : 'Return to room';
      opponentTaskDetail = opponent?.present
        ? 'Their next step is depositing a Martian into the pool.'
        : 'They need to come back to the room before the battle can continue.';
    } else {
      heroTitle = 'Battle now.';
      heroHint = 'Both Martians are deposited. Anyone can start the battle now.';
      nextActionLabel = 'Battle';
      opponentStatusLabel = opponent?.present ? 'Deposited' : 'Locked in';
      yourTaskLabel = 'Start battle';
      yourTaskDetail = 'The match is locked. Either trainer can tap Battle Now.';
      opponentTaskLabel = 'Start battle';
      opponentTaskDetail = 'They see the same Battle Now prompt on their side.';
    }
  }

  return {
    playerSide,
    bothDeposited,
    playerDeposited,
    opponentDeposited,
    canDeposit,
    canWithdraw,
    canStartBattle,
    heroTitle,
    heroHint,
    nextActionLabel,
    opponentStatusLabel,
    yourTaskLabel,
    yourTaskDetail,
    opponentTaskLabel,
    opponentTaskDetail,
  };
}

export function spectatorSummary(match: ArenaMatch): string {
  const left = match.monster_a_data?.name ?? short(match.player_a);
  const right = match.monster_b_data?.name ?? short(match.player_b);
  return `${left} vs ${right}`;
}
