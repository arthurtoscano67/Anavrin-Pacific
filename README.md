# Anavrin Legends Web

Production-ready Next.js + TypeScript website for the Anavrin NFT monster battle game on Sui.

## Stack

- Next.js 16 (App Router)
- React + TypeScript
- Tailwind CSS
- Sui dApp Kit + React Query
- Sui Kiosk SDK
- SSE real-time arena coordination API

## Features

- Wallet connect (Slush, Suiet via wallet standard)
- Home / Arena / My Monsters / Marketplace / Monster Customizer pages
- Fetch Monster NFTs from wallet and kiosks
- Arena:
  - live online player list
  - battle invites
  - spectator mode feed
  - on-chain battle controls (`create_match`, `deposit_monster`, `deposit_stake`, `start_battle`)
- Legacy React entrypoint (`src/anavrin/App.jsx`) includes a dedicated `Arena` tab powered by `src/anavrin/ArenaLobby.jsx`
- My Monsters:
  - mint
  - sync evolution
  - breed
  - list to kiosk
  - admin controls (`set_mint_price`, `set_mint_enabled`, `withdraw_fees`)
- Monster customizer with equipment slots:
  - hat, shirt, pants, shoes, armor, suit
- Marketplace dashboard for tracked kiosks + floor/listing view

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env.local
```

Required for realtime Arena Lobby on Cloudflare Pages:

- `VITE_LOBBY_WS_URL=wss://<your-worker>.workers.dev/lobby`

If this is missing, `/lobby` on Pages will serve static HTML and lobby presence will stay offline.

Deploy the lobby worker + Durable Object:

```bash
npm run lobby:deploy
```

Then add the Worker URL to your Cloudflare Pages project env:

- Variable: `VITE_LOBBY_WS_URL`
- Value: `wss://<your-worker>.workers.dev/lobby`

Local development (2 terminals):

1. Terminal A:

```bash
npm run lobby:dev
```

2. Terminal B:

```bash
npm run dev
```

3. Local env:

```bash
VITE_LOBBY_WS_URL=ws://127.0.0.1:8787/lobby
```

3. Run dev server:

```bash
npm run dev
```

App starts on `http://127.0.0.1:5174`.

## Build for production

```bash
npm run build
npm run start
```

## Notes

- Arena real-time state is implemented with in-memory server state + SSE route handlers.
- For multi-instance cloud deployment, swap arena state storage to Redis/Postgres and keep the same API surface.
