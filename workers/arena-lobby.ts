import type {
  BattleListKind,
  BattleSummary,
  LobbyInvite,
  LobbyOpenMatch,
  LobbyPlayer,
  LobbyRecentMatch,
  QueueEntry,
  QueueMatch,
  RoomChatMessage,
  RoomNotice,
  RoomParticipant,
} from '../src/app/arena/network/types';

type JoinMessage = {
  type: 'join';
  address: string;
  monsterName: string;
  level: number;
};

type LeaveMessage = {
  type: 'leave';
  address: string;
};

type InviteMessage = {
  type: 'invite';
  from: string;
  to: string;
  roomId?: string;
};

type InviteAcceptedMessage = {
  type: 'inviteAccepted';
  inviteId: string;
  from: string;
  to: string;
  roomId: string;
};

type MatchCreatedMessage = {
  type: 'matchCreated';
  creator: string;
  opponent?: string;
  stakeSui?: string;
  matchId?: string;
  monsterName?: string;
  level?: number;
};

type MatchStartedMessage = {
  type: 'matchStarted';
  from: string;
  to: string;
  roomId?: string;
  openMatchId?: string;
  inviteId?: string;
  matchId?: string;
  wagerAmount?: string;
  selectedMonsterA?: string;
  selectedMonsterB?: string;
  selectedMonsterAName?: string;
  selectedMonsterBName?: string;
};

type QueueJoinMessage = {
  type: 'queueJoin';
  address: string;
  monsterId: string;
  monsterName: string;
  stage: number;
  wagerAmount: string;
};

type QueueLeaveMessage = {
  type: 'queueLeave';
  address: string;
};

type JoinRoomMessage = {
  type: 'joinRoom';
  address: string;
};

type LeaveRoomMessage = {
  type: 'leaveRoom';
  address: string;
};

type JoinSpectatorMessage = {
  type: 'joinSpectator';
  viewerId: string;
  address?: string;
};

type LeaveSpectatorMessage = {
  type: 'leaveSpectator';
  viewerId: string;
};

type RoomSelectMessage = {
  type: 'roomSelect';
  address: string;
  monsterId?: string;
  monsterName?: string;
  stage?: number;
};

type RoomStakeMessage = {
  type: 'roomStake';
  address: string;
  stakeSui: string;
};

type RoomReadyMessage = {
  type: 'roomReady';
  address: string;
  ready: boolean;
};

type RoomChatMessageEnvelope = {
  type: 'roomChat';
  address: string;
  text: string;
};

type PingMessage = {
  type: 'ping';
};

type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | InviteMessage
  | InviteAcceptedMessage
  | MatchCreatedMessage
  | MatchStartedMessage
  | QueueJoinMessage
  | QueueLeaveMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | JoinSpectatorMessage
  | LeaveSpectatorMessage
  | RoomSelectMessage
  | RoomStakeMessage
  | RoomReadyMessage
  | RoomChatMessageEnvelope
  | PingMessage;

type LobbySession = {
  address?: string;
};

type RoomSession = {
  address?: string;
  viewerId?: string;
  kind: 'participant' | 'spectator';
};

type StoredGlobalState = {
  openMatches: LobbyOpenMatch[];
  invites: LobbyInvite[];
  recentMatches: LobbyRecentMatch[];
  queueEntries: QueueEntry[];
  battleSummaries: BattleSummary[];
};

type StoredRoomState = {
  participants: RoomParticipant[];
  notices: RoomNotice[];
  messages: RoomChatMessage[];
  createdAt: number;
};

const GLOBAL_STATE_KEY = 'globalState';
const ROOM_STATE_KEY = 'roomState';
const MAX_RECENT_MATCHES = 24;
const MAX_INVITES = 200;
const MAX_ROOM_NOTICES = 24;
const MAX_ROOM_MESSAGES = 40;
const MAX_SUMMARIES = 800;
const MAX_QUEUE = 500;
const ONLINE_WINDOW_MS = 15_000;

function toJson(data: unknown): string {
  return JSON.stringify(data);
}

function safeParseJson(value: string): ClientMessage | null {
  try {
    return JSON.parse(value) as ClientMessage;
  } catch {
    return null;
  }
}

function short(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function isAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{2,}$/.test(value);
}

function battleSummaryStatusFromMatchStatus(status: unknown): BattleSummary['status'] {
  const n = Number(status ?? 0);
  if (n === 1) return 'locked';
  if (n === 2) return 'finished';
  if (n === 3) return 'cancelled';
  return 'waiting';
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sortBattleSummaries(kind: BattleListKind, summaries: BattleSummary[]): BattleSummary[] {
  if (kind === 'highest') {
    return [...summaries].sort((a, b) => Number(b.wagerAmount) - Number(a.wagerAmount) || b.createdAt - a.createdAt);
  }

  if (kind === 'newest') {
    return [...summaries].sort((a, b) => b.createdAt - a.createdAt);
  }

  return [...summaries].sort(
    (a, b) => b.viewerCount - a.viewerCount || Number(b.wagerAmount) - Number(a.wagerAmount) || b.createdAt - a.createdAt
  );
}

export class ArenaLobby {
  private sessions = new Map<WebSocket, LobbySession>();
  private players = new Map<string, LobbyPlayer>();
  private openMatches = new Map<string, LobbyOpenMatch>();
  private invites = new Map<string, LobbyInvite>();
  private recentMatches: LobbyRecentMatch[] = [];
  private queueEntries = new Map<string, QueueEntry>();
  private battleSummaries = new Map<string, BattleSummary>();

  private roomSessions = new Map<WebSocket, RoomSession>();
  private roomParticipants = new Map<string, RoomParticipant>();
  private roomNotices: RoomNotice[] = [];
  private roomMessages: RoomChatMessage[] = [];
  private roomCreatedAt = Date.now();

  constructor(private readonly state: DurableObjectState) {
    this.state.blockConcurrencyWhile(async () => {
      const [storedGlobal, storedRoom] = await Promise.all([
        this.state.storage.get<StoredGlobalState>(GLOBAL_STATE_KEY),
        this.state.storage.get<StoredRoomState>(ROOM_STATE_KEY),
      ]);

      if (storedGlobal) {
        this.openMatches = new Map((storedGlobal.openMatches ?? []).map((item) => [item.id, item]));
        this.invites = new Map((storedGlobal.invites ?? []).map((item) => [item.id, item]));
        this.recentMatches = storedGlobal.recentMatches ?? [];
        this.queueEntries = new Map((storedGlobal.queueEntries ?? []).map((item) => [item.address, item]));
        this.battleSummaries = new Map((storedGlobal.battleSummaries ?? []).map((item) => [item.matchId, item]));
      }

      if (storedRoom) {
        this.roomCreatedAt = storedRoom.createdAt || Date.now();
        this.roomNotices = storedRoom.notices || [];
        this.roomMessages = storedRoom.messages || [];
        this.roomParticipants = new Map((storedRoom.participants || []).map((participant) => [participant.address, participant]));
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      if (url.pathname.startsWith('/room/') || url.pathname.startsWith('/ws/room/')) {
        this.acceptRoomSession(server);
      } else {
        this.acceptLobbySession(server);
      }

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (url.pathname.startsWith('/api/')) {
      return this.handleApiRequest(url, request);
    }

    return new Response('Expected websocket upgrade', { status: 426 });
  }

  private async handleApiRequest(url: URL, request: Request): Promise<Response> {
    if (url.pathname === '/api/lobby/snapshot') {
      this.sweepLobbyPresence();
      return this.json({
        onlineCount: [...this.players.values()].filter((player) => Date.now() - player.lastSeen < ONLINE_WINDOW_MS).length,
        queueCount: this.queueEntries.size,
      });
    }

    if (url.pathname === '/api/battles') {
      const kind = (url.searchParams.get('kind') ?? 'featured') as BattleListKind;
      const page = parsePositiveInt(url.searchParams.get('page'), 1);
      const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 6);
      const source = [...this.battleSummaries.values()].filter((summary) => summary.status !== 'cancelled');
      const sorted = sortBattleSummaries(kind, source);
      const start = (page - 1) * pageSize;
      return this.json({
        kind,
        page,
        pageSize,
        total: sorted.length,
        items: sorted.slice(start, start + pageSize),
      });
    }

    if (url.pathname.startsWith('/api/battles/')) {
      const matchId = url.pathname.replace('/api/battles/', '').trim();
      if (!matchId) {
        return this.json({ error: 'Missing match id' }, 400);
      }

      if (request.method === 'GET') {
        return this.json({ summary: this.battleSummaries.get(matchId) ?? null });
      }

      if (request.method === 'POST') {
        const payload = (await request.json().catch(() => null)) as BattleSummary | { summary?: BattleSummary } | null;
        const summary = (payload && 'summary' in payload ? payload.summary : payload) as BattleSummary | null;
        if (!summary?.matchId) {
          return this.json({ error: 'Missing summary payload' }, 400);
        }
        const next = this.upsertBattleSummary(summary);
        this.persistGlobalState();
        this.broadcastLobbyState();
        return this.json({ ok: true, summary: next });
      }
    }

    return this.json({ error: 'Not found' }, 404);
  }

  private json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  private acceptLobbySession(socket: WebSocket) {
    socket.accept();
    this.sessions.set(socket, {});

    socket.addEventListener('message', (event) => {
      this.onLobbyMessage(socket, event.data);
    });

    socket.addEventListener('close', () => {
      this.onLobbyDisconnect(socket);
    });

    socket.addEventListener('error', () => {
      this.onLobbyDisconnect(socket);
    });

    this.sendLobbyState(socket);
  }

  private acceptRoomSession(socket: WebSocket) {
    socket.accept();
    this.roomSessions.set(socket, { kind: 'spectator' });

    socket.addEventListener('message', (event) => {
      this.onRoomMessage(socket, event.data);
    });

    socket.addEventListener('close', () => {
      this.onRoomDisconnect(socket);
    });

    socket.addEventListener('error', () => {
      this.onRoomDisconnect(socket);
    });

    this.sendRoomState(socket);
  }

  private onLobbyMessage(socket: WebSocket, raw: unknown) {
    if (typeof raw !== 'string') return;

    const message = safeParseJson(raw);
    if (!message) {
      this.send(socket, { type: 'error', message: 'Invalid JSON message' });
      return;
    }

    switch (message.type) {
      case 'join':
        this.handleJoin(socket, message);
        return;
      case 'leave':
        this.handleLeave(socket, message);
        return;
      case 'invite':
        this.handleInvite(socket, message);
        return;
      case 'inviteAccepted':
        this.handleInviteAccepted(socket, message);
        return;
      case 'matchCreated':
        this.handleMatchCreated(socket, message);
        return;
      case 'matchStarted':
        this.handleMatchStarted(socket, message);
        return;
      case 'queueJoin':
        this.handleQueueJoin(socket, message);
        return;
      case 'queueLeave':
        this.handleQueueLeave(socket, message);
        return;
      case 'ping':
        this.touchLobbySession(socket);
        this.send(socket, { type: 'pong', timestamp: Date.now() });
        return;
      default:
        this.send(socket, { type: 'error', message: 'Unsupported lobby message type' });
    }
  }

  private onRoomMessage(socket: WebSocket, raw: unknown) {
    if (typeof raw !== 'string') return;

    const message = safeParseJson(raw);
    if (!message) {
      this.send(socket, { type: 'error', message: 'Invalid JSON message' });
      return;
    }

    switch (message.type) {
      case 'joinRoom':
        this.handleJoinRoom(socket, message);
        return;
      case 'leaveRoom':
        this.handleLeaveRoom(socket, message);
        return;
      case 'joinSpectator':
        this.handleJoinSpectator(socket, message);
        return;
      case 'leaveSpectator':
        this.handleLeaveSpectator(socket, message);
        return;
      case 'roomSelect':
        this.handleRoomSelect(socket, message);
        return;
      case 'roomStake':
        this.handleRoomStake(socket, message);
        return;
      case 'roomReady':
        this.handleRoomReady(socket, message);
        return;
      case 'roomChat':
        this.handleRoomChat(socket, message);
        return;
      case 'ping':
        this.touchRoomSession(socket);
        this.send(socket, { type: 'pong', timestamp: Date.now() });
        return;
      default:
        this.send(socket, { type: 'error', message: 'Unsupported room message type' });
    }
  }

  private onLobbyDisconnect(socket: WebSocket) {
    const session = this.sessions.get(socket);
    this.sessions.delete(socket);

    if (!session?.address) return;

    if (!this.hasActiveLobbySessionForAddress(session.address)) {
      this.removeAddressState(session.address);
    }

    this.broadcastLobbyState();
  }

  private onRoomDisconnect(socket: WebSocket) {
    const session = this.roomSessions.get(socket);
    this.roomSessions.delete(socket);

    if (session?.kind === 'participant' && session.address) {
      if (!this.hasActiveRoomSessionForAddress(session.address)) {
        const participant = this.roomParticipants.get(session.address);
        if (participant) {
          participant.present = false;
          participant.ready = false;
          participant.lastSeen = Date.now();
          this.pushRoomNotice(`${short(session.address)} left the room.`, 'warn');
          this.persistRoomState();
        }
      }
    }

    this.broadcastRoomState();
  }

  private handleJoin(socket: WebSocket, message: JoinMessage) {
    if (!isAddress(message.address)) {
      this.send(socket, { type: 'error', message: 'Invalid address in join message' });
      return;
    }

    const now = Date.now();
    const session = this.sessions.get(socket) ?? {};
    const previousAddress = session.address;
    const existing = this.players.get(message.address);

    const player: LobbyPlayer = {
      address: message.address,
      monsterName: message.monsterName || 'Legend',
      level: Number.isFinite(message.level) ? Number(message.level) : 1,
      joinedAt: existing?.joinedAt ?? now,
      lastSeen: now,
    };

    this.players.set(message.address, player);
    session.address = message.address;
    this.sessions.set(socket, session);

    if (previousAddress && previousAddress !== message.address && !this.hasActiveLobbySessionForAddress(previousAddress)) {
      this.removeAddressState(previousAddress);
    }

    this.broadcastLobbyState();
  }

  private handleLeave(socket: WebSocket, message: LeaveMessage) {
    const session = this.sessions.get(socket);
    const address = session?.address ?? message.address;
    if (!address) return;

    this.sessions.delete(socket);
    if (!this.hasActiveLobbySessionForAddress(address)) {
      this.removeAddressState(address);
    }

    this.broadcastLobbyState();
    try {
      socket.close(1000, 'Client left lobby');
    } catch {
      // no-op
    }
  }

  private handleInvite(socket: WebSocket, message: InviteMessage) {
    if (!isAddress(message.from) || !isAddress(message.to) || message.from === message.to) {
      return;
    }

    const session = this.sessions.get(socket);
    if (session?.address !== message.from) {
      this.send(socket, { type: 'error', message: 'Invite sender mismatch' });
      return;
    }

    const sender = this.players.get(message.from);
    const recipient = this.players.get(message.to);
    if (!sender || !recipient) {
      return;
    }

    const invite: LobbyInvite = {
      id: nextId('invite'),
      from: message.from,
      to: message.to,
      roomId: message.roomId || nextId('room'),
      monsterName: sender.monsterName,
      level: sender.level,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.invites.set(invite.id, invite);

    if (this.invites.size > MAX_INVITES) {
      const oldest = [...this.invites.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) this.invites.delete(oldest.id);
    }

    this.persistGlobalState();
    this.sendToAddress(message.to, { type: 'invite', invite });
    this.sendToAddress(message.from, { type: 'invite', invite });
    this.broadcastLobbyState();
  }

  private handleInviteAccepted(socket: WebSocket, message: InviteAcceptedMessage) {
    if (!isAddress(message.from) || !isAddress(message.to)) return;

    const session = this.sessions.get(socket);
    if (session?.address !== message.to) {
      this.send(socket, { type: 'error', message: 'Invite accept sender mismatch' });
      return;
    }

    const invite = this.invites.get(message.inviteId);
    if (!invite) return;
    if (invite.from !== message.from || invite.to !== message.to) {
      this.send(socket, { type: 'error', message: 'Invite accept payload mismatch' });
      return;
    }

    invite.status = 'accepted';
    this.invites.delete(message.inviteId);

    const accepted = {
      id: nextId('invite_accept'),
      inviteId: message.inviteId,
      from: message.from,
      to: message.to,
      roomId: message.roomId,
      acceptedAt: Date.now(),
    };

    this.pushRecent(`${short(message.to)} accepted ${short(message.from)}'s invite.`);
    this.persistGlobalState();
    this.sendToAddress(message.from, { type: 'inviteAccepted', accepted });
    this.sendToAddress(message.to, { type: 'inviteAccepted', accepted });
    this.broadcastLobbyState();
  }

  private handleMatchCreated(socket: WebSocket, message: MatchCreatedMessage) {
    if (!isAddress(message.creator)) return;

    const session = this.sessions.get(socket);
    if (session?.address !== message.creator) {
      this.send(socket, { type: 'error', message: 'Creator mismatch' });
      return;
    }

    const creator = this.players.get(message.creator);
    if (!creator) return;

    if (!message.opponent) {
      const openMatch: LobbyOpenMatch = {
        id: message.matchId || nextId('match'),
        creator: message.creator,
        creatorMonster: message.monsterName || creator.monsterName,
        creatorLevel: Number.isFinite(message.level) ? Number(message.level) : creator.level,
        stakeSui: String(message.stakeSui ?? '0'),
        createdAt: Date.now(),
      };
      this.openMatches.set(openMatch.id, openMatch);
      this.pushRecent(`${short(message.creator)} opened a battle room (${openMatch.stakeSui} SUI)`);
      this.persistGlobalState();
      this.broadcastLobbyState();
      return;
    }

    if (isAddress(message.opponent) && message.matchId) {
      this.upsertBattleSummary({
        matchId: message.matchId,
        playerA: message.creator,
        playerB: message.opponent,
        status: 'waiting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        viewerCount: 0,
        wagerAmount: String(message.stakeSui ?? '0'),
      });
      this.persistGlobalState();
      this.broadcastLobbyState();
    }
  }

  private handleMatchStarted(socket: WebSocket, message: MatchStartedMessage) {
    if (!isAddress(message.from) || !isAddress(message.to)) return;

    const session = this.sessions.get(socket);
    const sender = session?.address;
    if (!sender || (sender !== message.from && sender !== message.to)) {
      this.send(socket, { type: 'error', message: 'Match start sender mismatch' });
      return;
    }

    if (message.openMatchId) {
      this.openMatches.delete(message.openMatchId);
    }

    if (message.inviteId) {
      this.invites.delete(message.inviteId);
    }

    const started = {
      id: nextId('started'),
      from: message.from,
      to: message.to,
      roomId: message.matchId || message.roomId,
      openMatchId: message.openMatchId,
      inviteId: message.inviteId,
      matchId: message.matchId,
      startedAt: Date.now(),
    };

    if (message.matchId) {
      this.upsertBattleSummary({
        matchId: message.matchId,
        playerA: message.from,
        playerB: message.to,
        status: 'waiting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        viewerCount: this.battleSummaries.get(message.matchId)?.viewerCount ?? 0,
        wagerAmount: String(message.wagerAmount ?? this.battleSummaries.get(message.matchId)?.wagerAmount ?? '0'),
        selectedMonsterA: message.selectedMonsterA,
        selectedMonsterB: message.selectedMonsterB,
        selectedMonsterAName: message.selectedMonsterAName,
        selectedMonsterBName: message.selectedMonsterBName,
      });
    }

    this.pushRecent(`Arena ready: ${short(message.from)} vs ${short(message.to)}`);
    this.persistGlobalState();
    this.sendToAddress(message.from, { type: 'matchStarted', match: started });
    this.sendToAddress(message.to, { type: 'matchStarted', match: started });
    this.broadcastLobbyState();
  }

  private handleQueueJoin(socket: WebSocket, message: QueueJoinMessage) {
    if (!isAddress(message.address)) return;

    const session = this.sessions.get(socket);
    if (session?.address !== message.address) {
      this.send(socket, { type: 'error', message: 'Queue sender mismatch' });
      return;
    }

    this.queueEntries.set(message.address, {
      address: message.address,
      monsterId: message.monsterId,
      monsterName: message.monsterName,
      stage: Number.isFinite(message.stage) ? Number(message.stage) : 0,
      wagerAmount: String(message.wagerAmount ?? '0'),
      joinedAt: this.queueEntries.get(message.address)?.joinedAt ?? Date.now(),
      lastSeen: Date.now(),
    });

    if (this.queueEntries.size > MAX_QUEUE) {
      const oldest = [...this.queueEntries.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
      if (oldest) this.queueEntries.delete(oldest.address);
    }

    this.persistGlobalState();
    this.tryMatchmakeQueue();
    this.broadcastLobbyState();
  }

  private handleQueueLeave(socket: WebSocket, message: QueueLeaveMessage) {
    const session = this.sessions.get(socket);
    const address = session?.address ?? message.address;
    if (!address) return;

    this.queueEntries.delete(address);
    this.persistGlobalState();
    this.broadcastLobbyState();
  }

  private tryMatchmakeQueue() {
    const entries = [...this.queueEntries.values()]
      .filter((entry) => this.players.has(entry.address))
      .sort((a, b) => a.joinedAt - b.joinedAt);

    const matched = new Set<string>();

    for (let index = 0; index < entries.length; index += 1) {
      const first = entries[index];
      if (matched.has(first.address)) continue;

      const second = entries.find(
        (candidate, candidateIndex) =>
          candidateIndex > index &&
          !matched.has(candidate.address) &&
          candidate.address !== first.address &&
          candidate.wagerAmount === first.wagerAmount
      );

      if (!second) continue;

      matched.add(first.address);
      matched.add(second.address);
      this.queueEntries.delete(first.address);
      this.queueEntries.delete(second.address);

      const queueMatch: QueueMatch = {
        id: nextId('queue_match'),
        creator: first.address,
        playerA: first.address,
        playerB: second.address,
        monsterAId: first.monsterId,
        monsterAName: first.monsterName,
        monsterAStage: first.stage,
        monsterBId: second.monsterId,
        monsterBName: second.monsterName,
        monsterBStage: second.stage,
        wagerAmount: first.wagerAmount,
        createdAt: Date.now(),
      };

      this.pushRecent(`Queue match found: ${short(first.address)} vs ${short(second.address)}`);
      this.sendToAddress(first.address, { type: 'queueMatched', match: queueMatch });
      this.sendToAddress(second.address, { type: 'queueMatched', match: queueMatch });
    }

    if (matched.size > 0) {
      this.persistGlobalState();
    }
  }

  private handleJoinRoom(socket: WebSocket, message: JoinRoomMessage) {
    if (!isAddress(message.address)) {
      this.send(socket, { type: 'error', message: 'Invalid address in room join' });
      return;
    }

    const now = Date.now();
    const session = this.roomSessions.get(socket) ?? { kind: 'participant' as const };
    session.address = message.address;
    session.kind = 'participant';
    delete session.viewerId;
    this.roomSessions.set(socket, session);

    const existing = this.roomParticipants.get(message.address);
    this.roomParticipants.set(message.address, {
      address: message.address,
      joinedAt: existing?.joinedAt ?? now,
      lastSeen: now,
      present: true,
      monsterId: existing?.monsterId,
      monsterName: existing?.monsterName,
      stage: existing?.stage,
      stakeSui: existing?.stakeSui,
      ready: false,
    });

    this.pushRoomNotice(`${short(message.address)} entered the room.`, 'info');
    this.persistRoomState();
    this.broadcastRoomState();
  }

  private handleLeaveRoom(socket: WebSocket, message: LeaveRoomMessage) {
    const session = this.roomSessions.get(socket);
    const address = session?.address ?? message.address;
    if (!address) return;

    this.roomSessions.delete(socket);
    if (!this.hasActiveRoomSessionForAddress(address)) {
      const participant = this.roomParticipants.get(address);
      if (participant) {
        participant.present = false;
        participant.ready = false;
        participant.lastSeen = Date.now();
      }
      this.pushRoomNotice(`${short(address)} left the room.`, 'warn');
      this.persistRoomState();
    }

    this.broadcastRoomState();
    try {
      socket.close(1000, 'Client left room');
    } catch {
      // no-op
    }
  }

  private handleJoinSpectator(socket: WebSocket, message: JoinSpectatorMessage) {
    const session = this.roomSessions.get(socket) ?? { kind: 'spectator' as const };
    session.kind = 'spectator';
    session.viewerId = String(message.viewerId || nextId('viewer'));
    session.address = isAddress(message.address) ? message.address : undefined;
    this.roomSessions.set(socket, session);
    this.broadcastRoomState();
  }

  private handleLeaveSpectator(socket: WebSocket, _message: LeaveSpectatorMessage) {
    this.roomSessions.delete(socket);
    this.broadcastRoomState();
    try {
      socket.close(1000, 'Spectator left');
    } catch {
      // no-op
    }
  }

  private handleRoomSelect(socket: WebSocket, message: RoomSelectMessage) {
    if (!isAddress(message.address)) return;
    const session = this.roomSessions.get(socket);
    if (session?.address !== message.address) return;

    const participant = this.ensureRoomParticipant(message.address);
    participant.monsterId = message.monsterId;
    participant.monsterName = message.monsterName;
    participant.stage = Number.isFinite(message.stage) ? Number(message.stage) : participant.stage;
    participant.lastSeen = Date.now();
    participant.present = true;

    this.persistRoomState();
    this.broadcastRoomState();
  }

  private handleRoomStake(socket: WebSocket, message: RoomStakeMessage) {
    if (!isAddress(message.address)) return;
    const session = this.roomSessions.get(socket);
    if (session?.address !== message.address) return;

    const participant = this.ensureRoomParticipant(message.address);
    participant.stakeSui = String(message.stakeSui ?? '0');
    participant.lastSeen = Date.now();
    participant.present = true;

    this.persistRoomState();
    this.broadcastRoomState();
  }

  private handleRoomReady(socket: WebSocket, message: RoomReadyMessage) {
    if (!isAddress(message.address)) return;
    const session = this.roomSessions.get(socket);
    if (session?.address !== message.address) return;

    const participant = this.ensureRoomParticipant(message.address);
    participant.ready = Boolean(message.ready);
    participant.lastSeen = Date.now();
    participant.present = true;

    this.persistRoomState();
    this.broadcastRoomState();
  }

  private handleRoomChat(socket: WebSocket, message: RoomChatMessageEnvelope) {
    if (!isAddress(message.address)) return;
    const session = this.roomSessions.get(socket);
    if (session?.address !== message.address) return;

    const participant = this.ensureRoomParticipant(message.address);
    participant.lastSeen = Date.now();
    participant.present = true;

    const text = String(message.text ?? '').trim().replace(/\s+/g, ' ');
    if (!text) return;

    this.pushRoomMessage(message.address, text.slice(0, 280));
    this.persistRoomState();
    this.broadcastRoomState();
  }

  private ensureRoomParticipant(address: string): RoomParticipant {
    const existing = this.roomParticipants.get(address);
    if (existing) return existing;

    const created: RoomParticipant = {
      address,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      present: true,
      ready: false,
    };
    this.roomParticipants.set(address, created);
    return created;
  }

  private touchLobbySession(socket: WebSocket) {
    const session = this.sessions.get(socket);
    if (!session?.address) return;

    const now = Date.now();
    const player = this.players.get(session.address);
    if (player) {
      player.lastSeen = now;
    }

    const queued = this.queueEntries.get(session.address);
    if (queued) {
      queued.lastSeen = now;
    }
  }

  private touchRoomSession(socket: WebSocket) {
    const session = this.roomSessions.get(socket);
    if (!session) return;

    if (session.kind === 'participant' && session.address) {
      const participant = this.roomParticipants.get(session.address);
      if (!participant) return;
      participant.lastSeen = Date.now();
      participant.present = true;
    }
  }

  private sweepLobbyPresence(now = Date.now()) {
    for (const [address, player] of this.players) {
      if (now - player.lastSeen < ONLINE_WINDOW_MS) continue;
      if (this.hasActiveLobbySessionForAddress(address)) continue;
      this.removeAddressState(address);
    }

    for (const [address, entry] of this.queueEntries) {
      if (now - entry.lastSeen < ONLINE_WINDOW_MS) continue;
      if (this.hasActiveLobbySessionForAddress(address)) continue;
      this.queueEntries.delete(address);
    }
  }

  private sweepRoomPresence(now = Date.now()) {
    let changed = false;

    for (const [address, participant] of this.roomParticipants) {
      const online = this.hasActiveRoomSessionForAddress(address) || now - participant.lastSeen < ONLINE_WINDOW_MS;
      if (participant.present !== online) {
        participant.present = online;
        if (!online && participant.ready) {
          participant.ready = false;
        }
        changed = true;
      }
    }

    if (changed) {
      this.persistRoomState();
    }
  }

  private pushRecent(summary: string) {
    const item: LobbyRecentMatch = {
      id: nextId('recent'),
      summary,
      timestamp: Date.now(),
    };
    this.recentMatches.unshift(item);
    if (this.recentMatches.length > MAX_RECENT_MATCHES) {
      this.recentMatches.length = MAX_RECENT_MATCHES;
    }
  }

  private pushRoomNotice(summary: string, tone: RoomNotice['tone']) {
    const item: RoomNotice = {
      id: nextId('room_notice'),
      summary,
      timestamp: Date.now(),
      tone,
    };
    this.roomNotices.unshift(item);
    if (this.roomNotices.length > MAX_ROOM_NOTICES) {
      this.roomNotices.length = MAX_ROOM_NOTICES;
    }
  }

  private pushRoomMessage(address: string, text: string) {
    const item: RoomChatMessage = {
      id: nextId('room_chat'),
      address,
      text,
      timestamp: Date.now(),
    };
    this.roomMessages.unshift(item);
    if (this.roomMessages.length > MAX_ROOM_MESSAGES) {
      this.roomMessages.length = MAX_ROOM_MESSAGES;
    }
  }

  private upsertBattleSummary(input: BattleSummary): BattleSummary {
    const existing = this.battleSummaries.get(input.matchId);
    const next: BattleSummary = {
      ...existing,
      ...input,
      createdAt: existing?.createdAt ?? input.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      viewerCount: Number.isFinite(input.viewerCount) ? Number(input.viewerCount) : existing?.viewerCount ?? 0,
      wagerAmount: String(input.wagerAmount ?? existing?.wagerAmount ?? '0'),
      status: input.status ?? existing?.status ?? 'waiting',
      playerA: input.playerA ?? existing?.playerA ?? '',
      playerB: input.playerB ?? existing?.playerB ?? '',
    };

    this.battleSummaries.set(next.matchId, next);

    const overflow = this.battleSummaries.size - MAX_SUMMARIES;
    if (overflow > 0) {
      const oldest = [...this.battleSummaries.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, overflow);
      for (const item of oldest) {
        this.battleSummaries.delete(item.matchId);
      }
    }

    return next;
  }

  private broadcastLobbyState() {
    this.sweepLobbyPresence();
    for (const socket of this.sessions.keys()) {
      this.sendLobbyState(socket);
    }
  }

  private broadcastRoomState() {
    this.sweepRoomPresence();
    for (const socket of this.roomSessions.keys()) {
      this.sendRoomState(socket);
    }
  }

  private sendLobbyState(socket: WebSocket) {
    this.sweepLobbyPresence();
    const session = this.sessions.get(socket);
    const address = session?.address;

    const invites = address
      ? [...this.invites.values()].filter(
          (invite) => invite.status === 'pending' && (invite.from === address || invite.to === address)
        )
      : [];

    this.send(socket, {
      type: 'lobbyState',
      players: [...this.players.values()]
        .filter((player) => Date.now() - player.lastSeen < ONLINE_WINDOW_MS)
        .sort((a, b) => b.lastSeen - a.lastSeen),
      openMatches: [...this.openMatches.values()].sort((a, b) => b.createdAt - a.createdAt),
      recentMatches: this.recentMatches,
      invites,
      queueCount: this.queueEntries.size,
      timestamp: Date.now(),
    });
  }

  private roomViewerCount(): number {
    let count = 0;
    for (const session of this.roomSessions.values()) {
      if (session.kind === 'spectator') {
        count += 1;
      }
    }
    return count;
  }

  private sendRoomState(socket: WebSocket) {
    this.sweepRoomPresence();
    const participants = [...this.roomParticipants.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    this.send(socket, {
      type: 'roomState',
      room: {
        createdAt: this.roomCreatedAt,
        updatedAt: Date.now(),
        participants,
        notices: this.roomNotices,
        messages: this.roomMessages,
        roomReady: participants.filter((participant) => participant.ready).length >= 2,
        viewerCount: this.roomViewerCount(),
      },
    });
  }

  private sendToAddress(address: string, payload: unknown) {
    for (const [socket, session] of this.sessions) {
      if (session.address === address) {
        this.send(socket, payload);
      }
    }
  }

  private send(socket: WebSocket, payload: unknown) {
    try {
      socket.send(toJson(payload));
    } catch {
      this.onLobbyDisconnect(socket);
      this.onRoomDisconnect(socket);
    }
  }

  private hasActiveLobbySessionForAddress(address: string): boolean {
    for (const session of this.sessions.values()) {
      if (session.address === address) return true;
    }
    return false;
  }

  private hasActiveRoomSessionForAddress(address: string): boolean {
    for (const session of this.roomSessions.values()) {
      if (session.kind === 'participant' && session.address === address) return true;
    }
    return false;
  }

  private removeAddressState(address: string) {
    this.players.delete(address);
    this.queueEntries.delete(address);

    for (const [matchId, match] of this.openMatches) {
      if (match.creator === address) {
        this.openMatches.delete(matchId);
      }
    }

    for (const [inviteId, invite] of this.invites) {
      if (invite.from === address || invite.to === address) {
        this.invites.delete(inviteId);
      }
    }

    this.persistGlobalState();
  }

  private persistGlobalState() {
    void this.state.storage.put(GLOBAL_STATE_KEY, {
      openMatches: [...this.openMatches.values()],
      invites: [...this.invites.values()],
      recentMatches: this.recentMatches,
      queueEntries: [...this.queueEntries.values()],
      battleSummaries: [...this.battleSummaries.values()],
    } satisfies StoredGlobalState);
  }

  private persistRoomState() {
    void this.state.storage.put(ROOM_STATE_KEY, {
      participants: [...this.roomParticipants.values()],
      notices: this.roomNotices,
      messages: this.roomMessages,
      createdAt: this.roomCreatedAt,
    } satisfies StoredRoomState);
  }
}

export function toBattleSummaryFromChain(input: {
  matchId: string;
  playerA: string;
  playerB: string;
  matchStatus: number;
  createdAt?: number;
  viewerCount?: number;
  wagerAmount?: string;
  selectedMonsterA?: string | null;
  selectedMonsterB?: string | null;
  selectedMonsterAName?: string | null;
  selectedMonsterBName?: string | null;
}): BattleSummary {
  return {
    matchId: input.matchId,
    playerA: input.playerA,
    playerB: input.playerB,
    status: battleSummaryStatusFromMatchStatus(input.matchStatus),
    createdAt: input.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    viewerCount: input.viewerCount ?? 0,
    wagerAmount: input.wagerAmount ?? '0',
    selectedMonsterA: input.selectedMonsterA,
    selectedMonsterB: input.selectedMonsterB,
    selectedMonsterAName: input.selectedMonsterAName,
    selectedMonsterBName: input.selectedMonsterBName,
  };
}
