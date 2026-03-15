import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import ArenaLobby from "./ArenaLobby.jsx";

const PACKAGE_ID = "0x51abc7016876cd23efcd5a5240bc03ef0e3ed4538e0d87a029944d45cb3e4b81";
const TREASURY_ID = "0x414bd328952f9ddfde568e0a256476a0e2e148b21b606892f07ea3dd4360baeb";
const CLOCK_ID = "0x6";
const DISPLAY_ID = "0xda8656ee556049f5c96579340240a7da76654d02daf4b49808d00c6432dd72d8";
const RENDERER_BASE = "https://martians-renderer-production.up.railway.app";
const SUI_DECIMALS = 1_000_000_000;

const STAGES = [
  { name: "Egg", emoji: "🥚" },
  { name: "Baby", emoji: "🌱" },
  { name: "Adult", emoji: "⚔️" },
  { name: "Legend", emoji: "✨" },
];

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b1020; color: #e2e8f0; }
  .app { min-height: 100vh; background: radial-gradient(1200px 700px at 20% -10%, rgba(96,165,250,0.2), transparent), radial-gradient(1000px 700px at 110% 10%, rgba(167,139,250,0.2), transparent), #0b1020; }
  .header { position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 22px; border-bottom: 1px solid rgba(148,163,184,0.2); backdrop-filter: blur(8px); background: rgba(11,16,32,0.7); }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .brand small { margin-left: 8px; font-size: 12px; color: #94a3b8; font-weight: 600; }
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .tab { border: 1px solid rgba(148,163,184,0.3); background: rgba(15,23,42,0.55); color: #cbd5e1; border-radius: 10px; padding: 8px 12px; font-weight: 600; cursor: pointer; }
  .tab.active { border-color: #60a5fa; color: #60a5fa; }
  .main { max-width: 1150px; margin: 0 auto; padding: 24px 20px 40px; }
  .panel { background: rgba(15,23,42,0.7); border: 1px solid rgba(148,163,184,0.25); border-radius: 16px; padding: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
  .card { background: rgba(15,23,42,0.8); border: 1px solid rgba(148,163,184,0.2); border-radius: 14px; overflow: hidden; }
  .card-body { padding: 12px; display: grid; gap: 8px; }
  .img-wrap { width: 100%; aspect-ratio: 1; background: #020617; display: grid; place-items: center; }
  .img-wrap img { width: 100%; height: 100%; object-fit: cover; }
  .placeholder { font-size: 40px; }
  .muted { color: #94a3b8; font-size: 13px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #94a3b8; word-break: break-all; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .input { width: 100%; background: #0f172a; color: #e2e8f0; border: 1px solid rgba(148,163,184,0.3); border-radius: 10px; padding: 10px 12px; }
  .btn { border: 1px solid rgba(148,163,184,0.35); background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-weight: 700; }
  .btn.primary { border-color: #60a5fa; color: #60a5fa; }
  .btn.success { border-color: #4ade80; color: #4ade80; }
  .btn.warn { border-color: #f59e0b; color: #f59e0b; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .badge { display: inline-flex; gap: 6px; align-items: center; border: 1px solid rgba(148,163,184,0.3); border-radius: 999px; padding: 5px 10px; color: #cbd5e1; font-size: 12px; font-weight: 700; }
  .status { margin-top: 14px; border-radius: 10px; padding: 10px 12px; font-size: 13px; border: 1px solid; }
  .status.ok { border-color: rgba(74,222,128,0.45); color: #4ade80; background: rgba(34,197,94,0.1); }
  .status.err { border-color: rgba(248,113,113,0.45); color: #f87171; background: rgba(239,68,68,0.1); }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
  .stat { border: 1px solid rgba(148,163,184,0.25); border-radius: 12px; padding: 12px; min-width: 160px; background: rgba(15,23,42,0.7); }
  .stat .k { color: #94a3b8; font-size: 12px; margin-bottom: 2px; }
  .stat .v { font-size: 20px; font-weight: 800; }
  .title { font-size: 22px; font-weight: 800; margin-bottom: 6px; }
  .subtitle { color: #94a3b8; margin-bottom: 18px; }
  .divider { height: 1px; background: rgba(148,163,184,0.2); margin: 18px 0; }
  .modal-bg { position: fixed; inset: 0; background: rgba(2,6,23,0.7); display: grid; place-items: center; padding: 16px; z-index: 30; }
  .modal { width: min(460px, 100%); background: #111827; border: 1px solid rgba(148,163,184,0.3); border-radius: 14px; padding: 18px; display: grid; gap: 10px; }
`;

function formatSui(mist) {
  return (Number(mist || 0) / SUI_DECIMALS).toFixed(4);
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function parseError(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  return e.message || "Transaction failed";
}

function NftImage({ id }) {
  const [loaded, setLoaded] = useState(false);
  const src = `${RENDERER_BASE}/martian/${id}.svg`;

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className="img-wrap">
      {!loaded && <span className="placeholder">💗</span>}
      <img
        src={src}
        alt="Anavrin Legends NFT"
        onLoad={() => setLoaded(true)}
        style={{ display: loaded ? "block" : "none" }}
      />
    </div>
  );
}

function ConnectGate({ title, subtitle }) {
  return (
    <div className="panel" style={{ textAlign: "center", padding: 28 }}>
      <div className="title">{title}</div>
      <div className="subtitle">{subtitle}</div>
      <ConnectButton />
    </div>
  );
}

function ListModal({ nft, kioskCaps, onClose, onList }) {
  const [kioskCapId, setKioskCapId] = useState(kioskCaps[0]?.objectId || "");
  const [price, setPrice] = useState("");
  const selectedCap = useMemo(
    () => kioskCaps.find((k) => k.objectId === kioskCapId) || null,
    [kioskCaps, kioskCapId]
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 18, marginBottom: 0 }}>List to Kiosk</div>
        <div className="muted">Monster: {shortAddr(nft.objectId)}</div>
        <label className="muted">Kiosk Owner Cap</label>
        <select
          className="input"
          value={kioskCapId}
          onChange={(e) => setKioskCapId(e.target.value)}
        >
          {kioskCaps.map((cap) => (
            <option key={cap.objectId} value={cap.objectId}>
              {shortAddr(cap.objectId)} (kiosk {shortAddr(cap.kioskId)})
            </option>
          ))}
        </select>

        <label className="muted">Price (SUI)</label>
        <input
          className="input"
          type="number"
          min="0.000001"
          step="0.000001"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 1.25"
        />

        <div className="row">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={() => onList({ nft, kioskCap: selectedCap, price })}
            disabled={!selectedCap || !price || Number(price) <= 0}
          >
            List
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [tab, setTab] = useState("mint");
  const [mintConfig, setMintConfig] = useState(null);
  const [mintedCount, setMintedCount] = useState(0);
  const [myNfts, setMyNfts] = useState([]);
  const [kioskCaps, setKioskCaps] = useState([]);
  const [adminCapId, setAdminCapId] = useState(null);
  const [loading, setLoading] = useState({
    mint: false,
    nfts: false,
    admin: false,
    createKiosk: false,
  });
  const [listTarget, setListTarget] = useState(null);
  const [status, setStatus] = useState(null);
  const [mintPriceInput, setMintPriceInput] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");

  const setBusy = (key, value) => setLoading((prev) => ({ ...prev, [key]: value }));

  const runTx = useCallback(
    async (makeTx, successMsg) =>
      new Promise((resolve, reject) => {
        try {
          const tx = new Transaction();
          makeTx(tx);
          signAndExecute(
            { transaction: tx },
            {
              onSuccess: () => {
                setStatus({ type: "ok", msg: successMsg });
                resolve();
              },
              onError: (e) => {
                const msg = parseError(e);
                setStatus({ type: "err", msg });
                reject(new Error(msg));
              },
            }
          );
        } catch (e) {
          const msg = parseError(e);
          setStatus({ type: "err", msg });
          reject(new Error(msg));
        }
      }),
    [signAndExecute]
  );

  const fetchConfig = useCallback(async () => {
    try {
      const obj = await client.getObject({ id: TREASURY_ID, options: { showContent: true } });
      const fields = obj.data?.content?.fields;
      if (!fields) return;
      setMintConfig({
        mint_price_mist: fields.mint_price_mist,
        mint_enabled: Boolean(fields.mint_enabled),
        fees: fields.fees,
      });
    } catch (e) {
      console.error("fetchConfig", e);
    }
  }, [client]);

  const fetchMintedCount = useCallback(async () => {
    try {
      let cursor = null;
      let total = 0;
      for (let i = 0; i < 20; i += 1) {
        const page = await client.queryEvents({
          query: { MoveEventType: `${PACKAGE_ID}::monster::Minted` },
          cursor,
          limit: 50,
        });
        total += page.data.length;
        if (!page.hasNextPage) break;
        cursor = page.nextCursor;
      }
      setMintedCount(total);
    } catch (e) {
      console.error("fetchMintedCount", e);
    }
  }, [client]);

  const fetchMyNfts = useCallback(async () => {
    if (!account?.address) {
      setMyNfts([]);
      return;
    }
    setBusy("nfts", true);
    try {
      const res = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${PACKAGE_ID}::monster::Monster` },
        options: { showContent: true, showType: true },
      });
      setMyNfts(res.data.map((d) => d.data).filter(Boolean));
    } catch (e) {
      console.error("fetchMyNfts", e);
    }
    setBusy("nfts", false);
  }, [account?.address, client]);

  const fetchKioskCaps = useCallback(async () => {
    if (!account?.address) {
      setKioskCaps([]);
      return;
    }
    try {
      const res = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: "0x2::kiosk::KioskOwnerCap" },
        options: { showContent: true },
      });

      const caps = res.data
        .map((d) => d.data)
        .filter(Boolean)
        .map((capObj) => ({
          objectId: capObj.objectId,
          kioskId: capObj.content?.fields?.for || "",
        }));
      setKioskCaps(caps);
    } catch (e) {
      console.error("fetchKioskCaps", e);
    }
  }, [account?.address, client]);

  const fetchAdminCap = useCallback(async () => {
    if (!account?.address) {
      setAdminCapId(null);
      return;
    }
    try {
      const res = await client.getOwnedObjects({
        owner: account.address,
        filter: { StructType: `${PACKAGE_ID}::monster::AdminCap` },
        options: { showType: true },
      });
      setAdminCapId(res.data?.[0]?.data?.objectId || null);
    } catch {
      setAdminCapId(null);
    }
  }, [account?.address, client]);

  useEffect(() => {
    fetchConfig();
    fetchMintedCount();
  }, [fetchConfig, fetchMintedCount]);

  useEffect(() => {
    if (!account?.address) return;
    setWithdrawTo(account.address);
    fetchMyNfts();
    fetchKioskCaps();
    fetchAdminCap();
  }, [account?.address, fetchAdminCap, fetchKioskCaps, fetchMyNfts]);

  const handleMint = async () => {
    if (!account || !mintConfig) return;
    setBusy("mint", true);
    setStatus(null);
    try {
      await runTx(
        (tx) => {
          const priceMist = BigInt(mintConfig.mint_price_mist || 0);
          const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
          tx.moveCall({
            target: `${PACKAGE_ID}::monster::mint`,
            arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), coin],
          });
        },
        "Mint transaction submitted."
      );
      await Promise.all([fetchConfig(), fetchMintedCount(), fetchMyNfts()]);
    } finally {
      setBusy("mint", false);
    }
  };

  const handleSync = async (nftId) => {
    setStatus(null);
    await runTx(
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::hatch`,
          arguments: [tx.object(nftId), tx.object(CLOCK_ID)],
        });
      },
      "Monster synced."
    );
    await fetchMyNfts();
  };

  const handleCreateKiosk = async () => {
    setBusy("createKiosk", true);
    setStatus(null);
    try {
      await runTx(
        (tx) => {
          tx.moveCall({ target: `${PACKAGE_ID}::monster::create_kiosk`, arguments: [] });
        },
        "Kiosk created."
      );
      await fetchKioskCaps();
    } finally {
      setBusy("createKiosk", false);
    }
  };

  const handleList = async ({ nft, kioskCap, price }) => {
    const priceMist = BigInt(Math.floor(Number(price) * SUI_DECIMALS));
    setStatus(null);
    await runTx(
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::list_for_sale`,
          arguments: [
            tx.object(kioskCap.kioskId),
            tx.object(kioskCap.objectId),
            tx.object(nft.objectId),
            tx.pure.u64(priceMist),
          ],
        });
      },
      "Listed to kiosk."
    );
    setListTarget(null);
    await fetchMyNfts();
  };

  const runAdmin = async (buildTx, successMsg) => {
    if (!adminCapId) return;
    setBusy("admin", true);
    setStatus(null);
    try {
      await runTx(buildTx, successMsg);
      await fetchConfig();
    } finally {
      setBusy("admin", false);
    }
  };

  const handleCreateArenaMatch = useCallback(
    async (opponentAddress) => {
      if (!account?.address) {
        throw new Error("Connect wallet first.");
      }
      if (!opponentAddress || !/^0x[0-9a-fA-F]{2,}$/.test(opponentAddress.trim())) {
        throw new Error("Invalid opponent wallet address.");
      }

      await runTx(
        (tx) => {
          tx.moveCall({
            target: `${PACKAGE_ID}::monster::create_match`,
            arguments: [tx.pure.address(opponentAddress.trim()), tx.object(CLOCK_ID)],
          });
        },
        `On-chain arena match created vs ${shortAddr(opponentAddress)}.`
      );
    },
    [account?.address, runTx]
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="header">
          <div className="brand">
            💗 Anavrin Legends <small>mainnet</small>
          </div>
          <div className="tabs">
            {[
              ["mint", "Mint"],
              ["nfts", "My NFTs"],
              ["arena", "Arena"],
              ["admin", "Admin"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`tab ${tab === id ? "active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <ConnectButton />
        </header>

        <main className="main">
          <div className="stats">
            <div className="stat">
              <div className="k">Mint Price</div>
              <div className="v">{formatSui(mintConfig?.mint_price_mist)} SUI</div>
            </div>
            <div className="stat">
              <div className="k">Mint Status</div>
              <div className="v">{mintConfig?.mint_enabled ? "Open" : "Paused"}</div>
            </div>
            <div className="stat">
              <div className="k">Total Minted</div>
              <div className="v">{mintedCount}</div>
            </div>
            <div className="stat">
              <div className="k">Treasury Fees</div>
              <div className="v">{formatSui(mintConfig?.fees)} SUI</div>
            </div>
          </div>

          {status && <div className={`status ${status.type}`}>{status.msg}</div>}

          {tab === "mint" && (
            <div className="panel">
              <div className="title">Mint Monster</div>
              <div className="subtitle">
                Package <span className="mono">{PACKAGE_ID}</span>
              </div>
              {!account ? (
                <ConnectGate
                  title="Connect wallet to mint"
                  subtitle="Use a Sui wallet on mainnet."
                />
              ) : (
                <div className="row">
                  <span className="badge">Price: {formatSui(mintConfig?.mint_price_mist)} SUI</span>
                  <button
                    className="btn primary"
                    onClick={handleMint}
                    disabled={loading.mint || !mintConfig?.mint_enabled}
                  >
                    {loading.mint ? "Minting..." : "Mint"}
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "nfts" && (
            <>
              {!account ? (
                <ConnectGate
                  title="Connect wallet"
                  subtitle="Your monsters and kiosk controls appear here."
                />
              ) : (
                <div className="panel">
                  <div className="title">My Monsters</div>
                  <div className="subtitle">
                    Wallet: <span className="mono">{account.address}</span>
                  </div>

                  <div className="row" style={{ marginBottom: 14 }}>
                    <button
                      className="btn success"
                      onClick={handleCreateKiosk}
                      disabled={loading.createKiosk}
                    >
                      {loading.createKiosk ? "Creating..." : "Create Kiosk"}
                    </button>
                    <span className="muted">Kiosk caps: {kioskCaps.length}</span>
                  </div>

                  <div className="divider" />

                  {loading.nfts ? (
                    <div className="muted">Loading NFTs...</div>
                  ) : myNfts.length === 0 ? (
                    <div className="muted">No monsters in this wallet.</div>
                  ) : (
                    <div className="grid">
                      {myNfts.map((nft) => {
                        const fields = nft.content?.fields || {};
                        const stage = Number(fields.stage || 0);
                        return (
                          <div className="card" key={nft.objectId}>
                            <NftImage id={nft.objectId} />
                            <div className="card-body">
                              <div style={{ fontWeight: 800 }}>{fields.name || "Monster"}</div>
                              <div className="mono">{nft.objectId}</div>
                              <div className="badge">
                                {STAGES[stage]?.emoji || "?"} {STAGES[stage]?.name || "Unknown"}
                              </div>
                              <div className="row">
                                <button className="btn" onClick={() => handleSync(nft.objectId)}>
                                  Sync
                                </button>
                                <button
                                  className="btn primary"
                                  onClick={() => setListTarget(nft)}
                                  disabled={kioskCaps.length === 0}
                                >
                                  List
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "admin" && (
            <>
              {!account ? (
                <ConnectGate title="Admin controls" subtitle="Connect the AdminCap wallet." />
              ) : !adminCapId ? (
                <div className="panel">
                  <div className="title">Admin controls</div>
                  <div className="muted">This wallet does not hold the AdminCap.</div>
                </div>
              ) : (
                <div className="panel">
                  <div className="title">Admin controls</div>
                  <div className="subtitle">
                    AdminCap: <span className="mono">{adminCapId}</span>
                  </div>

                  <div className="row">
                    <button
                      className="btn warn"
                      disabled={loading.admin}
                      onClick={() =>
                        runAdmin(
                          (tx) => {
                            const next = !mintConfig?.mint_enabled;
                            tx.moveCall({
                              target: `${PACKAGE_ID}::monster::set_mint_enabled`,
                              arguments: [tx.object(TREASURY_ID), tx.object(adminCapId), tx.pure.bool(next)],
                            });
                          },
                          `Mint ${mintConfig?.mint_enabled ? "paused" : "enabled"}.`
                        )
                      }
                    >
                      {mintConfig?.mint_enabled ? "Pause mint" : "Enable mint"}
                    </button>
                  </div>

                  <div className="divider" />

                  <div className="row">
                    <input
                      className="input"
                      value={mintPriceInput}
                      onChange={(e) => setMintPriceInput(e.target.value)}
                      type="number"
                      min="0"
                      step="0.000001"
                      placeholder="New mint price (SUI)"
                    />
                    <button
                      className="btn primary"
                      disabled={loading.admin || !mintPriceInput}
                      onClick={() =>
                        runAdmin(
                          (tx) => {
                            const mist = BigInt(Math.floor(Number(mintPriceInput) * SUI_DECIMALS));
                            tx.moveCall({
                              target: `${PACKAGE_ID}::monster::set_mint_price`,
                              arguments: [tx.object(TREASURY_ID), tx.object(adminCapId), tx.pure.u64(mist)],
                            });
                          },
                          "Mint price updated."
                        )
                      }
                    >
                      Set price
                    </button>
                  </div>

                  <div className="divider" />

                  <div className="row">
                    <input
                      className="input"
                      value={withdrawTo}
                      onChange={(e) => setWithdrawTo(e.target.value)}
                      placeholder="Withdraw fees to address"
                    />
                    <button
                      className="btn primary"
                      disabled={loading.admin || !withdrawTo}
                      onClick={() =>
                        runAdmin(
                          (tx) => {
                            tx.moveCall({
                              target: `${PACKAGE_ID}::monster::withdraw_fees`,
                              arguments: [
                                tx.object(TREASURY_ID),
                                tx.object(adminCapId),
                                tx.pure.address(withdrawTo),
                              ],
                            });
                          },
                          "Fees withdrawn."
                        )
                      }
                    >
                      Withdraw fees
                    </button>
                  </div>

                  <div className="divider" />

                  <div className="row">
                    <input
                      className="input"
                      value={displayUrl}
                      onChange={(e) => setDisplayUrl(e.target.value)}
                      placeholder="Display image_url template"
                    />
                    <button
                      className="btn primary"
                      disabled={loading.admin || !displayUrl}
                      onClick={() =>
                        runAdmin(
                          (tx) => {
                            tx.moveCall({
                              target: `${PACKAGE_ID}::monster::update_display`,
                              arguments: [
                                tx.object(adminCapId),
                                tx.object(DISPLAY_ID),
                                tx.pure.string(displayUrl),
                              ],
                            });
                          },
                          "Display updated."
                        )
                      }
                    >
                      Update display
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "arena" && (
            <>
              {!account ? (
                <ConnectGate
                  title="Connect wallet for Arena"
                  subtitle="See online players and send real-time battle challenges."
                />
              ) : (
                <ArenaLobby
                  account={account}
                  monsters={myNfts}
                  onCreateMatch={handleCreateArenaMatch}
                />
              )}
            </>
          )}
        </main>

        {listTarget && (
          <ListModal
            nft={listTarget}
            kioskCaps={kioskCaps}
            onClose={() => setListTarget(null)}
            onList={handleList}
          />
        )}
      </div>
    </>
  );
}
