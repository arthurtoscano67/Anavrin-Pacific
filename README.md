# Pacific

Pacific is a Sui mainnet avatar platform with a strict playable-avatar boundary:

- wallet-connected ownership on Sui
- VRM 1.0 uploads written to Walrus through the upload relay
- a Walrus manifest blob referenced by an on-chain `Avatar` object
- a checkpoint-driven indexer that materializes active avatar state
- a Three.js + `@pixiv/three-vrm` browser runtime that only treats the avatar as playable after it loads
- a unified Unity WebGL handoff route (`/unity`) that loads wallet-owned runtime avatars through the same API
- shooter-first mint flow (`pick shooter -> mint -> launch multiplayer runtime`)
- NFT-linked shooter stats (`wins`, `losses`, `hp`) returned in avatar lookups and Unity profiles

## Repository layout

```text
ready-avatar-platform/
  apps/
    web/
    api/
    indexer/
  packages/
    move/
    shared/
  infra/
    walrus/
```

## Environment

Copy the root env template and split values into the app shells you run:

```bash
cp .env.example .env.local
```

Key variables:

- `VITE_API_BASE_URL`
- `VITE_AVATAR_PACKAGE_ID`
- `VITE_AVATAR_MINT_CONFIG_ID` (optional override; if empty the web app auto-discovers the shared mint config from chain events)
- `VITE_UNITY_WEBGL_URL`
- `DATABASE_URL`
- `AVATAR_PACKAGE_ID`
- `SUI_RPC_API_URL`
- `WALRUS_UPLOAD_RELAY_URL`
- `SHOOTER_MAX_PLAYERS_PER_MATCH`
- `SHOOTER_MAX_CONCURRENT_MATCHES`
- `SHOOTER_SERVER_TICK_RATE`
- `SHOOTER_DEFAULT_HP`

## Install

```bash
npm install
```

## Verify

```bash
npm run typecheck
npm run build
cd packages/move && sui move build
cd apps/indexer && cargo check
```

## Run

Web:

```bash
npm run dev:web
```

API:

```bash
npm run dev:api
```

Unity WebGL handoff:

- `/unity` in the web app builds a `profile` URL and launches Unity WebGL in-frame.
- API endpoint `GET /unity/profile/:wallet` returns Unity profile JSON with `resolution.httpUrl` pointing at `/asset/:blobId`.
- Shooter stats are available through:
  - `GET /shooter/stats/:wallet`
  - `POST /shooter/match` (winner/loser match result update)
  - `POST /shooter/match/local` (single-avatar local result update from MFPS match-over hook)
- Default Unity embed URL is `VITE_UNITY_WEBGL_URL=/unity-webgl/index.html`.

Local development note:

- If `DATABASE_URL` is not configured, shooter stat writes fall back to
  `apps/api/.data/shooter-local-store.json` so `/unity`, `/avatar/:wallet/owned`,
  and `/shooter/stats/:wallet` still reflect saved local match results.

Paid mint admin:

- `/admin` lets the wallet holding `MintAdminCap` update the on-chain mint price and treasury.
- If you upgraded an older package, `/admin` also exposes a one-time bootstrap flow that consumes the package `Publisher` object, creates the shared `MintConfig`, and transfers `MintAdminCap` to that wallet.
- Fresh publishes create `MintConfig` during package init automatically, so no bootstrap step is required there.

Unity build export command (inside Unity Editor):

- `MFPS Bridge/Build/WebGL For Ready Avatar Platform`
- This exports to `ready-avatar-platform/apps/web/public/unity-webgl`.

Indexer:

```bash
cd apps/indexer
cargo run -- \
  --database-url "$DATABASE_URL" \
  --avatar-package-id "$AVATAR_PACKAGE_ID" \
  --rpc-api-url "https://fullnode.mainnet.sui.io:443"
```

## Product rules

- Active playable uploads must be `.vrm`.
- Generic `.glb` is not accepted as the active player character.
- Runtime reads go through the HTTP API cache/gateway, not direct browser-side Walrus reads.
- Walrus storage is public by default; do not treat uploaded avatars as confidential.
