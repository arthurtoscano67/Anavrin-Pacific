import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_LOBBY_URL = "wss://anavrin-lobby.YOUR_ACCOUNT.workers.dev/lobby";
export const LOBBY_URL = import.meta.env.VITE_LOBBY_WS_URL || DEFAULT_LOBBY_URL;

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function upsertInvite(invites, invite) {
  const idx = invites.findIndex((item) => item.id === invite.id);
  if (idx === -1) return [invite, ...invites];
  const next = [...invites];
  next[idx] = invite;
  return next;
}

export default function ArenaLobby({ account, monsters, onCreateMatch }) {
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const shouldReconnectRef = useRef(true);

  const [connection, setConnection] = useState("closed");
  const [players, setPlayers] = useState([]);
  const [openMatches, setOpenMatches] = useState([]);
  const [recentMatches, setRecentMatches] = useState([]);
  const [invites, setInvites] = useState([]);
  const [selectedMonsterId, setSelectedMonsterId] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [stakeSui, setStakeSui] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!monsters?.length) {
      setSelectedMonsterId("");
      return;
    }
    if (!selectedMonsterId) {
      setSelectedMonsterId(monsters[0].objectId);
      return;
    }
    const exists = monsters.some((m) => m.objectId === selectedMonsterId);
    if (!exists) setSelectedMonsterId(monsters[0].objectId);
  }, [monsters, selectedMonsterId]);

  const selectedMonster = useMemo(
    () => (monsters || []).find((m) => m.objectId === selectedMonsterId) || (monsters || [])[0] || null,
    [monsters, selectedMonsterId]
  );

  const selectedMonsterName = selectedMonster?.content?.fields?.name || "Unknown";
  const selectedMonsterLevel = Number(selectedMonster?.content?.fields?.stage || 0) + 1;

  const sendRaw = (payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  useEffect(() => {
    if (!account?.address) {
      setConnection("closed");
      setPlayers([]);
      setOpenMatches([]);
      setRecentMatches([]);
      setInvites([]);
      return;
    }

    shouldReconnectRef.current = true;

    const connect = () => {
      setConnection("connecting");
      setError("");
      const ws = new WebSocket(LOBBY_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnection("open");
        sendRaw({
          type: "join",
          address: account.address,
          monsterName: selectedMonsterName,
          level: selectedMonsterLevel,
        });
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let parsed = null;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        if (parsed.type === "lobbyState") {
          setPlayers(Array.isArray(parsed.players) ? parsed.players : []);
          setOpenMatches(Array.isArray(parsed.openMatches) ? parsed.openMatches : []);
          setRecentMatches(Array.isArray(parsed.recentMatches) ? parsed.recentMatches : []);
          setInvites(Array.isArray(parsed.invites) ? parsed.invites : []);
          return;
        }

        if (parsed.type === "invite" && parsed.invite) {
          setInvites((prev) => upsertInvite(prev, parsed.invite));
          return;
        }

        if (parsed.type === "error") {
          setError(parsed.message || "Lobby error");
        }
      };

      ws.onerror = () => {
        setConnection("error");
      };

      ws.onclose = () => {
        if (!shouldReconnectRef.current) {
          setConnection("closed");
          return;
        }
        setConnection("connecting");
        reconnectRef.current = window.setTimeout(connect, 1500);
      };
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", address: account.address }));
      }
      if (ws) ws.close(1000, "cleanup");
      wsRef.current = null;
    };
  }, [account?.address, selectedMonsterLevel, selectedMonsterName]);

  const visiblePlayers = players.filter((p) => p.address !== account?.address);
  const incomingInvites = invites.filter((invite) => invite.to === account?.address && invite.status === "pending");

  const handleInvite = (to) => {
    if (!account?.address || !to) return;
    setTargetAddress(to);
    sendRaw({ type: "invite", from: account.address, to });
  };

  const handlePostOpen = () => {
    if (!account?.address) return;
    sendRaw({
      type: "matchCreated",
      creator: account.address,
      stakeSui: stakeSui || "0",
      monsterName: selectedMonsterName,
      level: selectedMonsterLevel,
    });
  };

  const handleAcceptInvite = async (invite) => {
    if (!account?.address) return;
    setBusy(true);
    setError("");
    try {
      sendRaw({
        type: "matchStarted",
        from: invite.from,
        to: invite.to,
        inviteId: invite.id,
      });
      await onCreateMatch(invite.from);
    } catch (e) {
      setError(e?.message || "Failed to create on-chain match");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ display: "grid", gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="title" style={{ fontSize: 20, marginBottom: 0 }}>Arena Lobby</div>
        <span className="badge">{connection === "open" || connection === "connecting" ? "OPEN" : "CLOSED"}</span>
      </div>
      <div className="muted">Endpoint: <span className="mono">{LOBBY_URL}</span></div>
      {error ? <div className="status err">{error}</div> : null}

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>ONLINE PLAYERS</div>
          {visiblePlayers.length === 0 ? (
            <div className="muted">No players online.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {visiblePlayers.map((player) => (
                <div key={player.address} style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{shortAddr(player.address)}</div>
                  <div className="muted">Monster: {player.monsterName} | Level {player.level}</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn primary" onClick={() => handleInvite(player.address)}>⚔ Challenge</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>LOBBY FEED</div>
          {recentMatches.length === 0 ? (
            <div className="muted">No recent matches.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {recentMatches.slice(0, 10).map((entry) => (
                <div key={entry.id} style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, padding: 10 }}>
                  <div>{entry.summary}</div>
                </div>
              ))}
            </div>
          )}
          <div className="divider" />
          <div style={{ fontWeight: 800, marginBottom: 8 }}>OPEN MATCHES</div>
          {openMatches.length === 0 ? (
            <div className="muted">No open matches.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {openMatches.slice(0, 10).map((match) => (
                <div key={match.id} style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>Match #{shortAddr(match.id)}</div>
                  <div className="muted">{shortAddr(match.creator)} vs Open</div>
                  <div className="muted">Stake: {match.stakeSui || "0"} SUI</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>CHALLENGE PANEL</div>
          <label className="muted">Your Fighter</label>
          <select
            className="input"
            value={selectedMonsterId}
            onChange={(e) => setSelectedMonsterId(e.target.value)}
            style={{ marginBottom: 8 }}
          >
            {(monsters || []).map((monster) => (
              <option key={monster.objectId} value={monster.objectId}>
                {(monster.content?.fields?.name || "Monster")} ({shortAddr(monster.objectId)})
              </option>
            ))}
          </select>

          <label className="muted">Target Address</label>
          <input
            className="input"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x..."
            style={{ marginBottom: 8 }}
          />

          <label className="muted">Stake (SUI)</label>
          <input
            className="input"
            value={stakeSui}
            onChange={(e) => setStakeSui(e.target.value)}
            placeholder="0"
            style={{ marginBottom: 10 }}
          />

          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn primary" disabled={!targetAddress} onClick={() => handleInvite(targetAddress)}>
              Send Challenge
            </button>
            <button className="btn" onClick={handlePostOpen}>Post Open Match</button>
          </div>

          <div style={{ fontWeight: 800, marginBottom: 8 }}>Incoming Invites</div>
          {incomingInvites.length === 0 ? (
            <div className="muted">No pending invites.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {incomingInvites.map((invite) => (
                <div key={invite.id} style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{shortAddr(invite.from)} challenged you</div>
                  <div className="muted">{invite.monsterName} | Level {invite.level}</div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn success" disabled={busy} onClick={() => handleAcceptInvite(invite)}>
                      {busy ? "Creating..." : "Accept + Create On-chain Match"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
