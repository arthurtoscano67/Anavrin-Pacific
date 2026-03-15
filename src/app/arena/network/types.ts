export type LobbyConnectionState = 'closed' | 'connecting' | 'open' | 'error';

export type LobbyPlayer = {
  address: string;
  monsterName: string;
  level: number;
  joinedAt: number;
  lastSeen: number;
};

export type LobbyOpenMatch = {
  id: string;
  creator: string;
  creatorMonster: string;
  creatorLevel: number;
  stakeSui: string;
  createdAt: number;
};

export type QueueEntry = {
  address: string;
  monsterId: string;
  monsterName: string;
  stage: number;
  wagerAmount: string;
  joinedAt: number;
  lastSeen: number;
};

export type QueueMatch = {
  id: string;
  creator: string;
  playerA: string;
  playerB: string;
  monsterAId: string;
  monsterAName: string;
  monsterAStage: number;
  monsterBId: string;
  monsterBName: string;
  monsterBStage: number;
  wagerAmount: string;
  createdAt: number;
};

export type LobbyInvite = {
  id: string;
  from: string;
  to: string;
  roomId: string;
  monsterName: string;
  level: number;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined';
};

export type LobbyRecentMatch = {
  id: string;
  summary: string;
  timestamp: number;
};

export type BattleSummaryStatus = "waiting" | "locked" | "finished" | "cancelled";

export type BattleSummary = {
  matchId: string;
  playerA: string;
  playerB: string;
  status: BattleSummaryStatus;
  createdAt: number;
  updatedAt: number;
  viewerCount: number;
  wagerAmount: string;
  selectedMonsterA?: string | null;
  selectedMonsterB?: string | null;
  selectedMonsterAName?: string | null;
  selectedMonsterBName?: string | null;
};

export type BattleListKind = "featured" | "highest" | "newest";

export type BattleListResponse = {
  items: BattleSummary[];
  kind: BattleListKind;
  page: number;
  pageSize: number;
  total: number;
};

export type StartedMatch = {
  id: string;
  from: string;
  to: string;
  roomId?: string;
  openMatchId?: string;
  inviteId?: string;
  matchId?: string;
  startedAt: number;
};

export type InviteAccepted = {
  id: string;
  inviteId: string;
  from: string;
  to: string;
  roomId: string;
  acceptedAt: number;
};

export type RoomParticipant = {
  address: string;
  joinedAt: number;
  lastSeen: number;
  present: boolean;
  monsterId?: string;
  monsterName?: string;
  stage?: number;
  stakeSui?: string;
  ready: boolean;
};

export type RoomNotice = {
  id: string;
  summary: string;
  timestamp: number;
  tone: 'info' | 'warn' | 'success';
};

export type RoomChatMessage = {
  id: string;
  address: string;
  text: string;
  timestamp: number;
};

export type RoomState = {
  createdAt: number;
  updatedAt: number;
  participants: RoomParticipant[];
  notices: RoomNotice[];
  messages: RoomChatMessage[];
  roomReady: boolean;
  viewerCount: number;
};
