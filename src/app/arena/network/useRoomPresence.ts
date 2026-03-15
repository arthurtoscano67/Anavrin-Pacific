import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildArenaSocketUrlCandidates } from './socket';
import type { LobbyConnectionState, RoomChatMessage, RoomNotice, RoomParticipant, RoomState } from './types';

type UseRoomPresenceOptions = {
  enabled: boolean;
  roomId?: string;
  address?: string;
  spectator?: boolean;
};

type RoomEnvelope = {
  type?: string;
  room?: RoomState;
  message?: string;
};

const RECONNECT_MS = 1800;
const PING_MS = 5_000;
const VIEWER_STORAGE_KEY = 'anavrinArenaViewerId';

function ensureViewerId(): string {
  if (typeof window === 'undefined') {
    return `viewer_${crypto.randomUUID()}`;
  }

  const existing = window.localStorage.getItem(VIEWER_STORAGE_KEY);
  if (existing) return existing;

  const created = `viewer_${crypto.randomUUID()}`;
  window.localStorage.setItem(VIEWER_STORAGE_KEY, created);
  return created;
}

export function useRoomPresence({ enabled, roomId, address, spectator = false }: UseRoomPresenceOptions) {
  const [connectionState, setConnectionState] = useState<LobbyConnectionState>('closed');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [notices, setNotices] = useState<RoomNotice[]>([]);
  const [messages, setMessages] = useState<RoomChatMessage[]>([]);
  const [roomReady, setRoomReady] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const viewerIdRef = useRef('');
  const endpointIndexRef = useRef(0);
  const endpoints = useMemo(() => (roomId ? buildArenaSocketUrlCandidates(`/ws/room/${roomId}`) : []), [roomId]);

  if (!viewerIdRef.current) {
    viewerIdRef.current = ensureViewerId();
  }

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
    if (!enabled || !roomId || (!address && !spectator)) {
      cleanupTimers();
      socketRef.current?.close();
      socketRef.current = null;
      setConnectionState('closed');
      setParticipants([]);
      setNotices([]);
      setMessages([]);
      setRoomReady(false);
      setViewerCount(0);
      return;
    }

    closedRef.current = false;
    endpointIndexRef.current = 0;

    const connect = () => {
      const endpoint = endpoints[Math.min(endpointIndexRef.current, endpoints.length - 1)] ?? '';
      let opened = false;
      setConnectionState('connecting');
      const socket = new WebSocket(endpoint);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        opened = true;
        setConnectionState('open');
        setLastError(null);
        if (spectator || !address) {
          socket.send(JSON.stringify({ type: 'joinSpectator', viewerId: viewerIdRef.current, address }));
        } else {
          socket.send(JSON.stringify({ type: 'joinRoom', address }));
        }
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_MS);
      });

      socket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RoomEnvelope;
          if (payload.type === 'roomState' && payload.room) {
            setParticipants(payload.room.participants ?? []);
            setNotices(payload.room.notices ?? []);
            setMessages(payload.room.messages ?? []);
            setRoomReady(Boolean(payload.room.roomReady));
            setViewerCount(payload.room.viewerCount ?? 0);
            return;
          }
          if (payload.type === 'error') {
            setLastError(payload.message ?? 'Room socket error');
            setConnectionState('error');
          }
        } catch {
          setLastError('Bad room payload');
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
        setLastError(`Room socket failed: ${endpoint}`);
      });
    };

    connect();

    return () => {
      closedRef.current = true;
      cleanupTimers();
      if (spectator || !address) {
        send({ type: 'leaveSpectator', viewerId: viewerIdRef.current });
      } else {
        send({ type: 'leaveRoom', address });
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [address, cleanupTimers, enabled, endpoints, roomId, send, spectator]);

  const setSelection = useCallback(
    (input: { monsterId?: string; monsterName?: string; stage?: number }) => {
      if (!address || spectator) return;
      send({ type: 'roomSelect', address, ...input });
    },
    [address, send, spectator]
  );

  const setStake = useCallback(
    (stakeSui: string) => {
      if (!address || spectator) return;
      send({ type: 'roomStake', address, stakeSui });
    },
    [address, send, spectator]
  );

  const setReady = useCallback(
    (ready: boolean) => {
      if (!address || spectator) return;
      send({ type: 'roomReady', address, ready });
    },
    [address, send, spectator]
  );

  const sendChat = useCallback(
    (text: string) => {
      if (!address || spectator) return false;
      return send({ type: 'roomChat', address, text });
    },
    [address, send, spectator]
  );

  return {
    endpoint: endpoints[Math.min(endpointIndexRef.current, Math.max(0, endpoints.length - 1))] ?? '',
    connectionState,
    isConnected: connectionState === 'open',
    participants,
    notices,
    messages,
    roomReady,
    viewerCount,
    lastError,
    setSelection,
    setStake,
    setReady,
    sendChat,
  };
}
