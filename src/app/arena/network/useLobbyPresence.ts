import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildArenaSocketUrlCandidates } from './socket';
import type {
  InviteAccepted,
  LobbyConnectionState,
  LobbyInvite,
  LobbyOpenMatch,
  LobbyPlayer,
  LobbyRecentMatch,
  QueueMatch,
  StartedMatch,
} from './types';

type UseLobbyPresenceOptions = {
  enabled: boolean;
  address?: string;
  monsterName?: string;
  level?: number;
};

type LobbyEnvelope = {
  type?: string;
  players?: LobbyPlayer[];
  openMatches?: LobbyOpenMatch[];
  invites?: LobbyInvite[];
  recentMatches?: LobbyRecentMatch[];
  queueCount?: number;
  invite?: LobbyInvite;
  match?: StartedMatch;
  accepted?: InviteAccepted;
  queueMatch?: QueueMatch;
  message?: string;
};

const RECONNECT_MS = 1800;
const PING_MS = 5_000;

export function useLobbyPresence({ enabled, address, monsterName = 'Legend', level = 1 }: UseLobbyPresenceOptions) {
  const [connectionState, setConnectionState] = useState<LobbyConnectionState>('closed');
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [openMatches, setOpenMatches] = useState<LobbyOpenMatch[]>([]);
  const [invites, setInvites] = useState<LobbyInvite[]>([]);
  const [recentMatches, setRecentMatches] = useState<LobbyRecentMatch[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [queueMatch, setQueueMatch] = useState<QueueMatch | null>(null);
  const [startedMatch, setStartedMatch] = useState<StartedMatch | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const endpointIndexRef = useRef(0);
  const endpoints = useMemo(() => buildArenaSocketUrlCandidates('/ws/lobby'), []);

  const send = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const cleanupTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !address) {
      cleanupTimers();
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionState('closed');
      return;
    }

    closedRef.current = false;
    endpointIndexRef.current = 0;

    const connect = () => {
      const endpoint = endpoints[Math.min(endpointIndexRef.current, endpoints.length - 1)] ?? endpoints[0];
      let opened = false;
      setConnectionState('connecting');
      const socket = new WebSocket(endpoint);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        opened = true;
        setConnectionState('open');
        setLastError(null);
        socket.send(
          JSON.stringify({
            type: 'join',
            address,
            monsterName,
            level,
          })
        );
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_MS);
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as LobbyEnvelope;
          if (payload.type === 'lobbyState') {
            setPlayers(payload.players ?? []);
            setOpenMatches(payload.openMatches ?? []);
            setInvites(payload.invites ?? []);
            setRecentMatches(payload.recentMatches ?? []);
            setQueueCount(payload.queueCount ?? 0);
            return;
          }
          if (payload.type === 'invite' && payload.invite) {
            setInvites((current) => {
              const next = [...current.filter((invite) => invite.id !== payload.invite?.id), payload.invite!];
              return next.sort((a, b) => b.createdAt - a.createdAt);
            });
            return;
          }
          if (payload.type === 'matchStarted' && payload.match) {
            setStartedMatch(payload.match);
            return;
          }
          if (payload.type === 'queueMatched' && payload.queueMatch) {
            setQueueMatch(payload.queueMatch);
            return;
          }
          if (payload.type === 'inviteAccepted' && payload.accepted) {
            setInvites((current) => current.filter((invite) => invite.id !== payload.accepted?.inviteId));
            return;
          }
          if (payload.type === 'error') {
            setLastError(payload.message ?? 'Lobby socket error');
            setConnectionState('error');
          }
        } catch {
          setLastError('Bad lobby payload');
          setConnectionState('error');
        }
      });

      socket.addEventListener('close', () => {
        cleanupTimers();
        if (closedRef.current) {
          setConnectionState('closed');
          return;
        }
        if (!opened && endpointIndexRef.current < endpoints.length - 1) {
          endpointIndexRef.current += 1;
          reconnectTimerRef.current = window.setTimeout(connect, 120);
          return;
        }
        setConnectionState('error');
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_MS);
      });

      socket.addEventListener('error', () => {
        setLastError(`Lobby socket failed: ${endpoint}`);
      });
    };

    connect();

    return () => {
      closedRef.current = true;
      cleanupTimers();
      send({ type: 'leave', address });
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [address, cleanupTimers, enabled, endpoints, level, monsterName, send]);

  const invitePlayer = useCallback(
    (to: string, roomId: string) => {
      if (!address) return;
      send({ type: 'invite', from: address, to, roomId });
    },
    [address, send]
  );

  const acceptInvite = useCallback(
    (invite: LobbyInvite) => {
      if (!address) return;
      send({
        type: 'inviteAccepted',
        inviteId: invite.id,
        from: invite.from,
        to: invite.to,
        roomId: invite.roomId,
      });
    },
    [address, send]
  );

  const postOpenMatch = useCallback(
    (stakeSui: string, fallbackMatchId?: string) => {
      if (!address) return;
      send({
        type: 'matchCreated',
        creator: address,
        stakeSui,
        matchId: fallbackMatchId,
        monsterName,
        level,
      });
    },
    [address, level, monsterName, send]
  );

  const announceMatchStarted = useCallback(
    (input: {
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
    }) => {
      send({ type: 'matchStarted', ...input });
    },
    [send]
  );

  const joinQueue = useCallback(
    (input: { monsterId: string; monsterName: string; stage: number; wagerAmount: string }) => {
      if (!address) return;
      send({ type: 'queueJoin', address, ...input });
    },
    [address, send]
  );

  const leaveQueue = useCallback(() => {
    if (!address) return;
    send({ type: 'queueLeave', address });
  }, [address, send]);

  const clearStartedMatch = useCallback(() => {
    setStartedMatch(null);
  }, []);

  const clearQueueMatch = useCallback(() => {
    setQueueMatch(null);
  }, []);

  return {
    endpoint: endpoints[Math.min(endpointIndexRef.current, Math.max(0, endpoints.length - 1))] ?? '',
    connectionState,
    isConnected: connectionState === 'open',
    players,
    openMatches,
    invites,
    recentMatches,
    queueCount,
    queueMatch,
    startedMatch,
    lastError,
    invitePlayer,
    acceptInvite,
    postOpenMatch,
    announceMatchStarted,
    joinQueue,
    leaveQueue,
    clearStartedMatch,
    clearQueueMatch,
  };
}
