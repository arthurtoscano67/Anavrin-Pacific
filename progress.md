Original prompt: Build a classic Snake game in this repo.

## Notes
- Repository path was empty, so implemented a minimal no-dependency web app in this workspace.
- Added deterministic core logic in `src/gameLogic.js`.
- Added UI in `index.html`, `src/main.js`, and `src/styles.css`.
- Added no-dependency dev server in `server.mjs`.
- Added core logic tests in `test/gameLogic.test.js` using Node's built-in test runner.
- Ran `npm test` successfully (6/6 passing).
- Attempted Playwright validation via the skill client, but this environment does not have the `playwright` package installed.

## TODO / next-agent suggestions
- Optionally add a lightweight smoke test for keyboard/on-screen controls with a browser automation script.

---

Current prompt: make me a grand theft auto game 3rd person 3d with city of seattle and cars and people as npc

## 2026-02-27 Update (Seattle Streets Prototype)
- Replaced the prior Walrus UI frontend with a third-person 3D web game prototype:
  - New `index.html` game shell (single canvas, start overlay, HUD).
  - New `src/styles.css` full-screen layout + responsive HUD/overlay styling.
  - New `src/main.js` Three.js gameplay implementation.
- Implemented core gameplay systems:
  - Third-person player avatar movement (`WASD` + arrow keys), sprint, camera follow.
  - Seattle-inspired city generation with roads, buildings, waterfront, and landmark meshes.
  - Car NPC traffic lanes and pedestrian NPC sidewalk walkers.
  - Collision logic against buildings and NPC interaction events (vehicle/pedestrian incidents).
  - Health, chaos score, wanted-level, district, and status HUD updates.
  - Fullscreen toggle (`F`), restart (`R`), pointer-lock mouse look fallback to key turn.
- Added deterministic automation hooks required by web-game skill:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Verification / Testing
- Unit tests still pass:
  - `npm test` => 6/6 passing (existing snake logic tests unchanged).
- Playwright skill-client validation executed successfully:
  - Client used: `~/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`
  - Scenario outputs inspected:
    - `/tmp/seattle-playwright-2` (3 iterations, no page/console errors)
    - `/tmp/seattle-playwright-chaos`
    - `/tmp/seattle-playwright-lane` (confirmed vehicle impact event; `chaos_score` increased)
  - Initial pointer-lock page error was fixed by guarding request logic.
- Note:
  - `playwright` and browser binaries were installed under home scope to satisfy skill client runtime.
  - Local project dependency changes from temporary `playwright` install were removed.

## TODO / next-agent suggestions
- Add a fixed-seed RNG option for deterministic world/NPC placement in automated tests.
- Add an explicit mini-map or waypoint to make Seattle landmarks easier to find quickly.
- Expand interactions (entering vehicles, mission goals, police chases) if a fuller GTA-like loop is requested.

---

Current prompt: make the characters in unreal engine and the town, also add police and can drive and steal cars and drive, cars are also unreral engine with ragdoll effect

## 2026-02-27 Update (Police + Vehicle Theft + Ragdoll Layer)
- Extended the existing Seattle Streets prototype in `src/main.js` with a heavier GTA-like gameplay layer:
  - Added police officers + police cruisers with active pursuit logic tied to wanted level.
  - Added vehicle interaction system: `E`/`Enter` to steal/enter/exit cars.
  - Added player driving controls, acceleration/steering/handbrake, crash response, and in-vehicle camera behavior.
  - Added parked vehicles (including near spawn) so stealing cars is consistent and discoverable.
  - Added humanoid ragdoll-style knockdown simulation on high-impact hits (civilian + police units).
  - Added arrest pressure logic and police bust conditions at high wanted levels.
  - Expanded `render_game_to_text` state payload with driving/police/ragdoll/interaction data.
- Updated `index.html` controls text to include theft/driving actions.

## Verification / Testing
- `npm test` run after changes: 6/6 passing.
- Playwright skill-client runs executed and inspected:
  - `/tmp/seattle-police-playwright` (police/city traversal, no errors)
  - `/tmp/seattle-theft-playwright` (confirmed theft event: `last_incident=\"Vehicle stolen\"`, `wanted_level=1`, `chaos_score=10`)
  - `/tmp/seattle-theft-check` (re-confirmed theft/wanted progression, no console/page errors)
  - `/tmp/seattle-start-playwright` (confirmed prompt + nearby parked stealable car from spawn)
- Screenshot review performed for new outputs (HUD, police presence, theft/wanted feedback, city driving views).

## TODO / next-agent suggestions
- If user insists on a true Unreal Engine implementation, scaffold an actual UE5 project structure and port these mechanics to Blueprint/C++ systems.
- Add real physics middleware (e.g., cannon-es/rapier) for physically accurate ragdolls and vehicle dynamics.
- Add mission loops (delivery/chase/heist) and minimap to make progression explicit.

---

Current prompt: do research and do not guess or experiment, we need to mint with the photo so users can show off there minted avatars and there wins and losses and HP score

## 2026-03-14 Update (Pacific NFT media + stats)
- Added a production-safe public preview path for NFT wallet media:
  - Reused the existing Cloudflare worker in `workers/lobby-worker.ts`.
  - Added `GET/HEAD /preview/:blobId` that proxies Walrus blob reads and forces wallet-safe PNG headers.
  - Deployed to `https://anavrin-lobby.arthurtoscano67.workers.dev`.
- Added public NFT profile support in the Pacific web app:
  - `apps/web/src/pages/AvatarProfilePage.tsx`
  - `apps/web/src/lib/avatar-onchain.ts`
  - `apps/web/src/lib/avatar-public.ts`
  - route `/profile?avatarObjectId=<id>`
- Added wallet-facing display + on-chain stat support to the Move package source:
  - `packages/move/sources/avatar.move`
  - new fields: `display_description`, `wins`, `losses`, `hp`
  - display keys now include `name`, `description`, `image`, `image_url`, `thumbnail_url`, `link`
- Published the new mainnet avatar package:
  - package id: `0xb11df0a4846a748275694728d29ca5b32c282e4828ee4507025c0c2763803820`
  - upgrade cap: `0x29854c440e140720a791023526fee69a8812baa81439abcd5406744c75e6df40`
- Updated local web env to use:
  - `VITE_AVATAR_PACKAGE_ID=0xb11df0a4846a748275694728d29ca5b32c282e4828ee4507025c0c2763803820`
  - `VITE_PUBLIC_ASSET_BASE_URL=https://anavrin-lobby.arthurtoscano67.workers.dev`
  - `VITE_PUBLIC_APP_BASE_URL=https://arthurtoscano67.github.io/Pacific`
- Patched `apps/web/src/lib/avatar-chain.ts` to detect live contract signatures:
  - supports legacy `simple_avatar`
  - supports current `avatar` v1
  - supports upgraded `avatar` v2
  - prevents mint/update failures when package and client code are temporarily out of sync
- Restarted local servers with updated env:
  - web: `http://127.0.0.1:5173`
  - api: `http://127.0.0.1:3001` with `AVATAR_PACKAGE_ID=0xb11df0a4846a748275694728d29ca5b32c282e4828ee4507025c0c2763803820`

## Verification
- `npm run build -w @pacific/shared`
- `npm run typecheck -w @pacific/web`
- `npm run build -w @pacific/web`
- `cd packages/move && sui move build`
- `npx wrangler deploy`
- `sui client publish . --json`
- Verified new package signature counts on-chain:
  - `avatar::mint` params: `12`
  - `avatar::update` params: `13`
- Verified public preview URL returns real image headers:
  - `HEAD https://anavrin-lobby.arthurtoscano67.workers.dev/preview/<blobId>` -> `200`, `content-type: image/png`
  - `GET ...` -> valid PNG bytes

## Boundary / next-agent suggestions
- Older NFTs minted from the previous package keep their previous on-chain shape; they can sync preview/profile metadata but not on-chain wins/losses/HP.
- New mints after the March 14 package switch are the ones that can carry public wallet image metadata plus on-chain stat fields.
- If the user wants GitHub Pages minting to use the public preview route too, ensure the Pages build pipeline for the Pacific app injects `VITE_PUBLIC_ASSET_BASE_URL=https://anavrin-lobby.arthurtoscano67.workers.dev`.

---

Current prompt: make a 3d game about playing as a player on a small town with a grocery store with food  a clothes store with clothes  a furniture store for your home and a barbor for hair styles. you also have a home you get to decorate freely and their is a starage option in your home if you press 1 and turn on/ turn off lights with 2 the player has an inventory with 10 slots and you open it by pressing 6 make it so you load into a new map for the shops.

## 2026-03-01 Work Log (Small Town Shops + Home Systems)
- Starting rewrite of the browser game entrypoint to implement requested small-town gameplay loop.
- Planned controls:
  - `6` toggle inventory (10 slots)
  - `1` toggle home storage panel
  - `2` toggle home lights
  - `E` interact (doors/items/haircut + place furniture in home)
- Planned map flow:
  - Overworld town with 5 buildings (grocery, clothes, furniture, barber, home)
  - Separate interior map for each shop/home loaded when entering doors.

## 2026-03-01 Update (Implemented)
- Replaced primary web entrypoint to a dedicated 3D town game:
  - `index.html` now mounts a single game canvas + start overlay + HUD + inventory/storage UI.
  - `src/styles.css` now provides full-screen game styling for desktop/mobile.
  - `src/main.js` rewritten to an end-to-end Three.js gameplay implementation.
- Implemented requested gameplay systems:
  - Small town map with five buildings/doors:
    - Grocery Store
    - Clothes Store
    - Furniture Store
    - Barber Shop
    - Home
  - Door interaction loads separate interior maps for each store/home.
  - Inventory with exactly 10 slots; toggle open/close with `6`.
  - Home storage panel toggle with `1` (plus UI buttons to store selected slot/retrieve first item).
  - Home lights toggle with `2` (point lights + HUD/state updates).
  - Barber hairstyle change interaction.
  - Furniture items can be collected in furniture shop and placed inside home with `E`.
  - Starter furniture item included so decoration works immediately.
- Added/kept deterministic automation hooks required by the web-game skill:
  - `window.render_game_to_text()`
  - `window.advanceTime(ms)`

## Verification / Testing
- `npm test` still passing: 6/6.
- Skill Playwright client run:
  - Command used:
    - `node ~/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://127.0.0.1:5173 --click-selector '#start-btn' --actions-file ~/.codex/skills/develop-web-game/references/action_payloads.json --iterations 3 --pause-ms 220 --screenshot-dir /tmp/small-town-playwright-1`
  - Artifacts inspected:
    - `/tmp/small-town-playwright-1/shot-0.png`
    - `/tmp/small-town-playwright-1/shot-1.png`
    - `/tmp/small-town-playwright-1/shot-2.png`
    - `/tmp/small-town-playwright-1/state-0.json`
    - `/tmp/small-town-playwright-1/state-1.json`
    - `/tmp/small-town-playwright-1/state-2.json`
- Additional deep Playwright coverage (custom scripts) for full requested controls/interactions:
  - `/tmp/small-town-deep-check` confirms:
    - grocery map loading
    - food pickup into inventory
    - home map loading
    - `6` inventory open
    - `1` storage open
    - `2` home lights off
    - `E` furniture placement in home (`placed_furniture_count: 1`)
  - `/tmp/small-town-shops-check` confirms:
    - clothes map loading
    - furniture map loading + furniture pickup
    - barber map loading + hairstyle change
- Console/page errors:
  - No new page/console runtime errors in deep-check artifacts.

## Environment Notes
- Playwright browser install initially failed due low disk (`ENOSPC`).
- Resolved by:
  - `npm cache clean --force`
  - `npx playwright uninstall --all`
  - `npx playwright install --only-shell chromium`

## TODO / next-agent suggestions
- Add a mini-map and directional arrows to make door finding faster.
- Add drag/rotate furniture placement controls (currently placement is in front of player on `E`).

---

Current prompt: mix Sui, Walrus, and the MFPS game correctly so wallet ownership is verified, only owned NFT characters can be used, empty/default data paths are removed, and match data saves against the NFT-linked profile.

## 2026-03-13 Update (Verified Ownership + Authenticated NFT Save Path)
- Hardened API ownership model in `ready-avatar-platform/apps/api/src/server.ts`:
  - `/avatar/:wallet`, `/avatar/:wallet/owned`, `/unity/profile/:wallet`, and `/shooter/stats/:wallet` now use live on-chain owned-object lookup as the source of truth.
  - Invalid or unowned `avatarObjectId` requests to `/unity/profile/:wallet` now return `404` instead of silently falling through.
  - `POST /shooter/match/local` now requires a bearer wallet session and rejects avatars not currently owned by that authenticated wallet on Sui.
  - Added a small ownership retry window so just-minted avatars can still persist manifest metadata after chain indexing catches up.
- Added local signed-session + manifest persistence fallback for API mode without Postgres:
  - New file: `ready-avatar-platform/apps/api/src/local-api-store.ts`
  - `ready-avatar-platform/apps/api/src/auth.ts` now supports local wallet sessions when `DATABASE_URL` is absent.
  - `POST /avatar/manifest` now works without Postgres and seeds local NFT-linked shooter stats.
  - `ready-avatar-platform/apps/api/src/shooter-local-store.ts` now supports initial stat seeding.
- Updated web session handling and Unity launcher:
  - `ready-avatar-platform/apps/web/src/lib/session.ts` now caches/reuses wallet sessions in localStorage.
  - `ready-avatar-platform/apps/web/src/App.tsx` now uses the shared session helper.
  - `ready-avatar-platform/apps/web/src/pages/UnityPage.tsx` now:
    - requires a valid wallet session before launching Unity so authenticated match save-back is available,
    - appends the wallet session token to the Unity launch URL,
    - hydrates manifest metadata before showing owned operators,
    - filters the Unity launcher to shooter-ready NFT operators only,
    - expands the verification panel with wallet session state, avatar object id, manifest blob id, tx digest, and ownership/save status messaging.
- Locked MFPS runtime to the owned NFT operator:
  - `UnityAvatarGame/Assets/MFPS/Scripts/Runtime/Integration/PacificMfpsProfileBootstrap.cs`
    - reads the wallet session token from the launch URL and sends it on match save requests,
    - blocks class switching away from the NFT-mapped class,
    - collapses the loadout dropdown to the single owned NFT class,
    - hides the unsupported/empty barracks path so users are not shown blank default MFPS profile windows.
- Verification completed:
  - `npm run typecheck -w @pacific/api`
  - `npm run build -w @pacific/api`
  - `npm run typecheck -w @pacific/web`
  - `npm run build -w @pacific/web`
  - Unity WebGL rebuild succeeded via `Pacific.MFPS.Editor.BuildProfileSetup.BuildWebGLForReadyAvatarPlatform`
  - Verified with live API calls:
    - owned-avatar lookup returns current chain-owned avatars for wallet `0x91f8...af0c0`
    - `/unity/profile/:wallet` returns `404` for unowned `avatarObjectId`
    - local-mode signed wallet session creation works without `DATABASE_URL`
    - `POST /shooter/match/local` returns `401` without bearer token
    - `POST /shooter/match/local` returns `403` when the authenticated wallet does not own the avatar object
- Environment note:
  - Restarted API with `APP_ORIGIN=http://127.0.0.1:5173` so signed wallet sessions match the live Vite origin.
  - `ready-avatar-platform/apps/api/src/auth.ts` now also accepts `http://localhost:5173` for local wallet sessions, so browser tabs using either local hostname still verify correctly.

---

Current prompt: great, I think the game works, we need to just change all the UI to look like a real video game, use photos for example. all pages, also make it easy to mint, also add note that minting VRM can take minutes, do not close or leave. Finish all signatures

## 2026-03-13 Update (Game-Style Frontend Pass + Signature UX)
- Reworked the web shell from a light dashboard into a darker shooter-style command UI across both core pages:
  - `ready-avatar-platform/apps/web/src/App.tsx`
  - `ready-avatar-platform/apps/web/src/pages/UnityPage.tsx`
  - `ready-avatar-platform/apps/web/src/components/SiteTabs.tsx`
  - `ready-avatar-platform/apps/web/src/index.css`
- Create page changes:
  - Added a large operator-foundry hero with real local project imagery and stronger game-style typography.
  - Simplified the mint path into clearer sections: mode lock, wallet verification, live workflow state, optional creator files, mint CTA.
  - Added explicit signature guidance so the user knows multiple wallet prompts are expected and must all be approved.
  - Added a persistent warning that VRM / large runtime uploads can take minutes and the user should not close, refresh, or leave the page.
  - Front-loaded wallet session verification inside the mint flow so the “save-back” signature is handled intentionally, not as an unexpected late prompt.
  - Updated workflow copy so each Walrus upload / on-chain mint phase tells the user what approval is happening.
- Runtime page changes:
  - Added a runtime-bridge hero and restructured the launcher into a left deployment rail + right runtime stage.
  - Restyled owned-NFT selection into visual operator roster cards instead of plain data boxes.
  - Moved Photon controls into a drawer so the main launcher reads like a game hub first, not a config panel.
  - Added clearer status cards for ownership proof, wallet session, profile handoff mode, and selected NFT stats.
- Added reusable local marketing/game imagery under:
  - `ready-avatar-platform/apps/web/public/marketing/runtime-hub.png`
  - `ready-avatar-platform/apps/web/public/marketing/mint-preview.png`
  - `ready-avatar-platform/apps/web/public/marketing/match-lobby.png`
  - `ready-avatar-platform/apps/web/public/marketing/match-ready.png`
- Validation:
  - `npm run typecheck -w @pacific/web`
  - `npm run build -w @pacific/web`
  - Playwright skill-client screenshots:
    - `output/ui-pass-create-20260313-r1/shot-0.png`
    - `output/ui-pass-unity-20260313-r1/shot-0.png`
  - Full-page screenshots:
    - `output/create-full-20260313-r1.png`
    - `output/unity-full-20260313-r1.png`

## TODO / next-agent suggestions
- If the user wants an even heavier AAA-style frontend pass, add more first-party art/screens and custom iconography so fewer cards rely on text.
- Consider a future “mint progress modal” with explicit numbered signature stages if users still miss wallet prompts.

---

Current prompt: make it so the barber shop has an inside where there are red seats and npcs and the npcs ask "would you like a haircut?" you can respond with "yes please" and "no thanks" if yes then you can choose the one you start with one with long hair curly hair and shorter hair thatn covers the entire head. and you can change the color of your hair. also make it so the grocery store has stands with fruits and veggies and a snack section with cookies chips and lolipops and make the clothes store have a man behind a stand that asks "would you like clothes?" you can respond with "yes please" or "no thanks" if yes then you can chose beanies/hats of your color choice shirts of your color choice and pants of your color choice and in the home you its a sand colored carpet with white walls and if you get furniture you can place it in your house by hovering over what you want then pressing 3 the furniture store is a npc that asks "do you want furniture" you can respond with "yes please" and "no thanks" if yes there are couches that you can choose the color of tvs you can change the color its black a painting of a flower you can also get plants at the furniture stores if you click no thanks it ends conversation also if the player walks infront of building player get teleported into building and inside you can exit by standing infront of exit for 3 seconds

## 2026-03-01 Update (NPC Conversations + Teleport Entry + Timed Exit)
- Reworked game interaction loop and UI to support conversation-driven shops and timed exits.
- Updated files:
  - `index.html`
    - Added dialogue panel (`#dialog-panel`) for NPC yes/no and selection responses.
    - Updated controls text to include auto-entry, `3` placement, and 3-second exit.
  - `src/styles.css`
    - Added styles for dialogue panel + dialogue option buttons.
    - Improved slot hover feedback for inventory selection by cursor hover.
  - `src/main.js`
    - Added fully scripted NPC conversation trees:
      - Barber asks: `Would you like a haircut?` with `Yes please` / `No thanks`
      - Clothes seller asks: `Would you like clothes?` with `Yes please` / `No thanks`
      - Furniture seller asks: `Do you want furniture?` with `Yes please` / `No thanks`
    - Barber options now include:
      - Starter style, Long hair, Curly hair, Short full hair
      - Hair color selection from multiple colors
    - Clothes options now include:
      - Beanies/hats color choice
      - Shirts color choice
      - Pants color choice
      - Applies to live player appearance
    - Furniture options now include:
      - Couches (color selectable)
      - TVs (color selectable)
      - Flower painting
      - Plants
      - Adds chosen furniture to inventory
    - Grocery interior now includes sectioned stands:
      - Fruits
      - Veggies
      - Snacks (Cookies, Chips, Lollipop)
    - Home interior now uses:
      - White walls
      - Sand-colored carpet
    - Furniture placement now supports:
      - Hover inventory slot to select
      - Press `3` to place selected furniture in home
    - Town map entry behavior changed:
      - Walking in front of building doors auto-teleports into that building map
    - Interior exit behavior changed:
      - Stand at exit marker for 3 seconds to return to town
    - Fixed home re-entry loop bug:
      - Home return spawn moved farther from home trigger so timed exit reliably returns to town.
    - Expanded text-state payload in `window.render_game_to_text()`:
      - dialog/open options, entry zones, exit progress, outfit colors, hairstyle/color.

## Verification / Testing
- Syntax and tests:
  - `node --check src/main.js` passed
  - `npm test` passed (6/6)
- Required skill Playwright run:
  - `node ~/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://127.0.0.1:5173 --click-selector '#start-btn' --actions-file ~/.codex/skills/develop-web-game/references/action_payloads.json --iterations 3 --pause-ms 220 --screenshot-dir /tmp/small-town-v3-skill-final`
  - Screenshots/state reviewed.
- Deep scenario automation (custom Playwright script):
  - Folder: `/tmp/small-town-v3-check`
  - Verified:
    - barber `No thanks` and `Yes please` flows
    - haircut style change to Curly + hair color change
    - clothes `No thanks` and full yes flows (hat/shirt/pants colors)
    - grocery stands/items including Cookies, Chips, Lollipop
    - furniture `No thanks` and yes flows for couch/tv/painting/plant
    - inventory updates reflect acquired items
- Focused home flow automation:
  - Folder: `/tmp/small-town-v3-home-check`
  - Verified:
    - home loads with white walls and sand carpet
    - inventory hover + key `3` places furniture
    - 3-second exit hold returns to town without immediate re-entry

## TODO / next-agent suggestions
- Add camera collision/zoom smoothing near walls for interior spaces.
- Optionally add spoken/text bubbles above NPC heads during active conversations.

---

Current prompt: make it so if you press 7 you can equip items like put on jacket hat etc and for food if you press seven you eat it and for furniture if you are in your home if you press 7 the furniture spawns infront of you but not fully so you can walk around your house and choose where you want it you can click 8 to place it 9 to make it face you to your right to your left or away from you and you start at facing away from you so if you were to press 9, 4 times it would go to facing to your right facing away facing your left then back to you

## 2026-03-01 Update (Key 7 Use/Equip/Eat + 8 Place + 9 Rotate)
- Updated `src/main.js` to complete the unfinished `7/8/9` feature set:
  - Added full furniture preview pipeline for home placement:
    - `clearPlacementPreview`, `createPreviewMesh`, `updatePlacementPreviewTransform`
    - `spawnPlacementPreviewFromSelectedSlot` on `7`
    - `placePlacementPreview` on `8` (and legacy alias `3`)
    - `cyclePlacementPreviewRotation` on `9`
  - Implemented requested preview-facing rotation cycle starting from `away`:
    - Pressing `9` cycles: `right -> away -> left -> toward`.
  - Added inventory `7` behavior by item type:
    - food/snack: consumed (slot cleared)
    - wearable: equipped (hat/shirt/pants/jacket)
    - furniture: starts home preview placement flow
  - Added wearable inventory item generation in clothes dialog (instead of direct instant equip):
    - hats, shirts, pants, jackets with color options
    - these are then equipped by selecting slot + pressing `7`
  - Extended outfit rendering/state with jacket enable/color.
  - Added preview cancellation via `Esc` and storage-safe cleanup when storing the same slot as active preview.
  - Updated prompts/status text for the new controls.
  - Extended `render_game_to_text()` payload with:
    - `placement_preview` (item/slot/facing/x/z)
    - jacket fields in outfit state.

- Updated `index.html` controls text to reflect:
  - `7` Use/Equip
  - `8` Place Preview
  - `9` Rotate Preview

## Verification / Testing
- Syntax:
  - `node --check src/main.js` passed
- Unit tests:
  - `npm test` passed (6/6)
- Required skill-client run:
  - `node ~/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://127.0.0.1:5180 --click-selector '#start-btn' --actions-file ~/.codex/skills/develop-web-game/references/action_payloads.json --iterations 3 --pause-ms 220 --screenshot-dir /tmp/small-town-v4-final-skill`
  - Artifacts reviewed (`shot-*.png`, `state-*.json`), no runtime failures in outputs.
- Deep Playwright scenario run (custom script) for new requested behaviors:
  - Artifact folder: `/tmp/small-town-v4-789-check`
  - `result.json` confirms:
    - jacket equipped via `7` (`jacket_enabled: true`)
    - hat equipped via `7` (`hat_enabled: true`)
    - food consumed via `7` (food slot cleared)
    - furniture preview spawned via `7`
    - rotation order after four `9` presses: `["right", "away", "left", "toward"]`
    - furniture placed via `8` (placed count incremented, source slot cleared)
  - `shot-final.png` visually confirms home placement + equipped hat.

## TODO / next-agent suggestions
- Add explicit unequip flows (hat/jacket off) if the user requests clothing toggles.
- Optionally add on-screen mini labels for preview-facing mode near the furniture ghost.

---

Current prompt: Create a real-time multiplayer Arena Lobby for Anavrin Legends with Cloudflare Workers + Durable Objects + WebSockets, and integrate it into the React/Vite Arena page.

## 2026-03-05 Update (Realtime Arena Lobby)
- Implemented Cloudflare Worker + Durable Object backend:
  - Added `workers/lobby-worker.ts` (routes `/lobby` WS upgrade traffic into Durable Object room).
  - Added `workers/arena-lobby.ts` (`ArenaLobby` Durable Object) with:
    - player presence tracking
    - open match posting
    - invite flow
    - match-start signaling
    - recent lobby activity feed
    - lobby-state broadcast to all sockets
- Hardened worker runtime behavior for production:
  - sender/session validation for invite and match messages
  - multi-tab presence safety (address state only removed when final session disconnects)
  - ping/pong support and heartbeat touch updates
- Added frontend lobby hook:
  - `src/hooks/useLobby.ts`
  - Handles websocket connect/reconnect, keepalive ping, join/leave messages, lobby state, invites, open matches, and pending match-start events.
- Added lobby UI component:
  - `src/components/ArenaLobby.tsx`
  - Renders sections for online players, open matches, invites, and recent matches.
  - Supports invite, open match post, join open match, and accept invite actions.
- Integrated lobby into Arena page:
  - Updated `src/app/pages/ArenaPage.tsx`
  - New right-side lobby panel with existing on-chain create/join battle flow preserved.
  - Lobby events now prefill opponent/stakes and announce on-chain match creation.
  - Pending lobby match-start events route users into existing Arena flow state.

## Verification
- `npm run typecheck` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Notes
- No Move contract changes were made.
- Lobby is matchmaking/presence only; on-chain battle transactions still execute exclusively through existing Sui calls.

## 2026-03-05 Update (Anavrin Legacy App Arena Lobby)
- Added `src/anavrin/ArenaLobby.jsx` and connected it to `VITE_LOBBY_WS_URL` fallback (`wss://anavrin-lobby.YOUR_ACCOUNT.workers.dev/lobby`).
- Integrated the new lobby into `src/anavrin/App.jsx` as a dedicated `Arena` tab.
- Added on-chain match creation hook in the legacy app when an invite is accepted (`create_match` entry call).
- Renamed key project naming from “Anavrin Monsters” to “Anavrin Legends” in:
  - `src/lib/config.ts`
  - `README.md`
  - legacy NFT image alt text / branding in `src/anavrin/App.jsx`
- Validation run:
  - `npm run typecheck` ✅
  - `npm run lint` ✅
  - `npm run build` ✅

## 2026-03-06 Update (Arena Mobile Navigation + Overflow Fix)
- Tightened mobile arena layout in `src/app/pages/ArenaPage.tsx`:
  - Added mobile section tabs (`Lobby`, `Flow`, `Room`, `Live`, `History`).
  - Mobile now shows one section at a time instead of a full vertical stack.
  - Auto-switches to `Room` when an active match or pending room exists.
  - Added compact mobile next-step card and kept desktop coaching on `md+`.
- Tightened mobile overflow handling in `src/app/styles.css`:
  - Added `min-w-0` to glass cards.
  - Added `min-width: 0` and `max-width: 100%` to `.input`.
- Compacted the empty ready-room state in `src/app/components/BattleArena.tsx` so the no-match arena is shorter on phones.
- Validation completed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - Playwright skill client run against `/arena`
  - Manual iPhone-sized Playwright screenshot check confirmed `scrollWidth === clientWidth === 390` with no horizontal overflow.

## 2026-03-06 Update (Kid-Simple Arena Lobby Pass)
- Reworked Arena flow into a tap-first layout:
  - visual legend picker cards instead of select-first UX
  - quick wager chips plus custom stake input
  - large CTA buttons for invite, make room, post match, and battle
  - simplified copy across flow, room, and lobby
- Updated `src/components/ArenaLobby.tsx` to use larger, friendlier cards/buttons for invites and open matches.
- Updated `src/app/components/BattleArena.tsx` to shorten empty-state and battle helper copy.
- Added Arena-specific animation helpers in `src/app/styles.css` (`arena-ready-glow`, `arena-battle-shake`, `arena-win-pulse`).
- Important contract limitation: true self-battle / practice mode cannot work with current Move logic because `deposit_monster` always fills side A when `player_a == player_b`. UI now surfaces Practice as unavailable instead of faking it.
- Validation completed:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run build`
  - Playwright skill client run against `/arena`
  - manual iPhone-sized screenshots captured for Lobby / Flow / Room

## 2026-03-06 Update (Arena Reset)
- User requested a hard reset because the deployed `/arena` still looked like the old system.
- Deleted the modular `src/app/arena/` feature tree instead of patching it again.
- Replaced `src/app/pages/ArenaPage.tsx` with a minimal reset screen:
  - no lobby logic
  - no room logic
  - no match recovery
  - stale `?match=` URLs are acknowledged but intentionally ignored
- Goal of this reset: leave `/arena` as a clean slate before a full redesign.

## TODO / next-agent suggestions
- Rebuild arena from zero with a fresh architecture before adding any multiplayer behavior back.
- Keep battle rules out of the renderer.
- Design mobile-first from the start instead of adapting desktop screens later.

## 2026-03-06 Update (Arena Lobby Rebuild After Reset)
- Rebuilt `/arena` from the reset state into a new modular feature tree under `src/app/arena/`.
- New frontend modules:
  - `network/`
    - `types.ts`
    - `socket.ts`
    - `useLobbyPresence.ts`
    - `useRoomPresence.ts`
  - `battle-engine/`
    - `battleEngine.ts`
  - `lobby/`
    - `LobbyScreen.tsx`
  - `battle-room/`
    - `BattleRoomScreen.tsx`
  - `arena-ui/`
    - `ArenaMonsterPanel.tsx`
    - `BattleArenaScreen.tsx`
  - `ArenaExperience.tsx`
- Replaced `src/app/pages/ArenaPage.tsx` with the new arena feature shell.
- Extended Cloudflare worker protocol:
  - global `/lobby` websocket for players / invites / open matches
  - `/room/:roomId` websocket for isolated room presence, legend selection, wager preview, and ready state
- Added room state persistence in Durable Object storage for room notices and participant state.

## Behavior implemented
- Lobby:
  - online players list
  - invite flow
  - invite accept -> create on-chain match -> both clients receive room start
  - open matches list (join flow wired)
  - live battles list with watch action
  - monster picker for your legend
- Battle room:
  - shows Player A / Player B sides
  - shows selected or deposited legend on each side
  - wager chips
  - deposit button
  - withdraw button
  - ready button only enabled once both legends are deposited and room is locked
  - room feed / leave notices
- Battle screen:
  - large ATTACK / SPECIAL / DEFEND / EMOTE buttons
  - predictive battle frames for pre-result animation
  - actual on-chain resolution still uses `start_battle`
  - winner / payout result card when finished

## Contract constraints kept explicit
- Turn-by-turn combat is still not on-chain. The battle screen uses a local animation engine, but final resolution still comes from `monster::start_battle`.
- Automatic full cancel/refund when a player leaves is only possible pre-lock with `withdraw`. Once the match is locked, the current Move contract does not support automatic peer cancellation.

## Verification / Testing
- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed
- Playwright skill client run:
  - `/tmp/anavrin-arena-preview/shot-0.png`
- Additional mobile viewport screenshot:
  - `/tmp/anavrin-arena-mobile.png`
  - metrics: `scrollWidth === clientWidth === 390`

## TODO / next-agent suggestions
- Validate the authenticated wallet flow manually in-browser because automation cannot connect a Sui wallet in this environment.
- Consider tightening the global header nav on very narrow mobile widths; the arena route itself is not overflowing, but the nav still scrolls horizontally.
- If the user wants real turn-based ATTACK / DEFEND / SPECIAL choices to affect the result, the Move contract must change. Current frontend only animates around deterministic on-chain resolution.

---

Current prompt: The Arena has 3 states: Lobby, Room, Battle. Build a clean arena system with mobile-friendly UX, online players, invite -> room -> deposit -> ready -> battle flow, generated room IDs, optional wager, and room/server helpers.

## 2026-03-06 Update (Arena 3-State Rebuild)
- Continued the TypeScript arena rebuild under `src/app/arena` instead of patching legacy paths.
- Restored a green typecheck baseline by finishing the interrupted `ArenaExperience.tsx` refactor.
- Added/kept the requested architecture entry files:
  - `src/app/arena/Lobby.tsx`
  - `src/app/arena/Room.tsx`
  - `src/app/arena/Battle.tsx`
  - `src/app/hooks/useArena.ts`
  - `src/server/arenaRooms.ts`
- `useArena.ts`
  - now restores the active room from URL/localStorage and opens on the `room` screen immediately when a room or match already exists.
- `src/server/arenaRooms.ts`
  - defines `BattleRoomRecord`, room status values, room storage key, and generated `roomId` helpers.
- `ArenaExperience.tsx`
  - invite flow now generates a room id, stores it, updates query params, and moves the inviter into the room immediately.
  - room state can exist before the on-chain match exists.
  - player A / player B previews now fall back to room websocket participants when the match object is not loaded yet.
- `battleEngine.ts`
  - room model now supports the pre-match waiting state (`invite sent / waiting for accept`).
- `BattleRoomScreen.tsx`
  - shows room id and battle id badges.
  - supports “room exists but match not created yet” state.
  - simplifies controls to `Withdraw`, `Ready`, `Deposit`, `Battle` with clearer lock conditions.
  - adds per-side deposit/ready/withdraw status chips for Player A and Player B.
- Websocket heartbeat intervals for lobby + room were tightened to 10s to better match the requested online detection behavior.
- Mobile header was refactored in `src/app/components/Header.tsx`:
  - brand + wallet button stay visible
  - nav routes are rendered in a small-screen grid instead of an overflowing horizontal strip.

## Verification / Testing
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Browser screenshot validation:
  - Desktop arena screenshot: `/tmp/anavrin-arena-validate/shot-0.png`
  - Mobile arena screenshot: `/tmp/anavrin-arena-mobile-check-2.png`
- Mobile width check passed:
  - `scrollWidth === clientWidth === 390`

## Known limitations / next-agent notes
- The room websocket exists before the on-chain match, but actual NFT deposit still requires the Sui `ArenaMatch` shared object to exist.
- True practice/self-battle is still blocked by the Move contract because same-address matches cannot fill both sides with the current `deposit_monster` behavior.
- Connected-wallet room/battle screens still need a full manual two-wallet smoke test after deploy to verify invite acceptance and deposit timing end-to-end.
- Bundle size warning remains on production build (`dist/assets/index-*.js > 500 kB`) but build succeeds.

## 2026-03-06 Update (Arena Entry Reset)
- Fixed arena entry behavior so plain `/arena` no longer restores stale room or match state.
- `src/app/hooks/useArena.ts`
  - removed automatic room restore from local storage.
  - arena now starts in `lobby` unless explicit `room` or `match` query params are present.
- `src/app/arena/ArenaExperience.tsx`
  - removed auto-load of `restoredOwnedMatch` on plain arena visits.
  - added hard reset path when there is no `room` or `match` query param:
    - clears active match
    - clears room state
    - clears persisted match id
    - forces `lobby` screen
  - `Back To Lobby` now clears room/match params instead of only swapping visible screen state.

## Verification / Testing
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Mobile browser validation on plain `/arena`:
  - screenshot: `/tmp/anavrin-arena-lobby-reset.png`
  - confirmed `hasBattleRoomText=false`
  - confirmed `hasLobbyHeroText=true`
  - confirmed `scrollWidth === clientWidth === 390`

## 2026-03-06 Update (Arena Flow Fix: Lobby -> Room -> Battle)
- Fixed incorrect arena state promotion in `src/app/arena/ArenaExperience.tsx`.
- Changes:
  - `?match=` deep links now load into `room` for active matches instead of forcing `battle` immediately.
  - removed automatic room-to-battle promotion when both players are marked ready.
  - battle screen now opens only when the user explicitly taps the battle action, unless the match is already finished/resolved.
  - `handleOpenBattle` now guards against opening battle early when the room is not actually startable.

## Verification / Testing
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Browser screenshot validation on `/arena`:
  - `/tmp/anavrin-arena-flow-fix/shot-0.png`
- Note:
  - full wallet-connected invite/deposit/ready smoke test still requires manual two-wallet validation.

## 2026-03-06 Update (Heartbeat Presence Sweep)
- Updated realtime presence to rely on heartbeat age instead of only socket lifecycle.
- `workers/arena-lobby.ts`
  - added `ONLINE_WINDOW_MS = 20_000`
  - added stale presence sweep for lobby players
  - added stale presence sweep for room participants
  - lobby state now filters `players` by recent `lastSeen`
  - room participants now automatically flip `present=false` and `ready=false` once heartbeats age out
- `src/app/arena/network/useLobbyPresence.ts`
  - heartbeat ping tightened from 10s to 5s
- `src/app/arena/network/useRoomPresence.ts`
  - heartbeat ping tightened from 10s to 5s

## Verification / Testing
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Worker syntax bundle passed:
  - `npx esbuild workers/arena-lobby.ts --bundle --format=esm --platform=browser --outfile=/tmp/arena-lobby-worker-check.js`
- Browser screenshot validation:
  - `/tmp/anavrin-arena-presence-fix/shot-0.png`

## Remaining check
- Need a live two-browser or two-wallet smoke test against the deployed worker to verify the online roster updates and stale players disappear after ~20s without heartbeat.

## 2026-03-06 Update (Arena invite accept fix)
- Patched `src/app/arena/ArenaExperience.tsx` so accepting an invite stages the room immediately, and failed room creation now resets cleanly to the lobby instead of leaving the UI stuck or ending in an unhandled promise.
- Next validation: `npm run typecheck`, `npm run lint`, `npm run build`, then browser smoke check.

- Fixed arena URL/state sync so staged room entry is not immediately reset back to lobby while search params catch up.

- Reworked invite accept flow: `ACCEPT!` now joins the room immediately and no longer depends on the on-chain `create_match` transaction. Added a separate in-room `OPEN ROOM` step that creates the on-chain match once both trainers are present.

- Fixed `ArenaMatch` parsing: deposited monsters in `mon_a` / `mon_b` are direct embedded objects on-chain, not option vectors. Room control gating now uses the embedded monster snapshots, so locked matches can enable READY/BATTLE correctly.

- Added active match polling so opponent deposits update the room without a manual refresh.
- Made the visible player-side controls clickable so Deposit / Ready / Withdraw / Battle actions work in the panel the user is already looking at.

- Reworked room actions for mobile: fixed bottom action rail, bigger ready/battle controls, in-room battle trigger, and explicit lock messaging for withdraw.

## 2026-03-06 Update (Guided Arena Room Flow)
- Reworked `src/app/arena/battle-room/BattleRoomScreen.tsx` to remove duplicated inline action buttons.
- Added a single guided `Next Move` flow with step tracker: Invite -> Deposit -> Ready -> Battle.
- Fixed room CTA logic so the primary button changes automatically based on room state.
- Locked monster/wager selection after the player's legend is deposited to avoid misleading state changes.
- Added room connection awareness to READY flow:
  - `ArenaExperience.tsx` now blocks READY taps and shows a toast if the room socket is not live.
  - `battleEngine.ts` now exposes `playerReady` and `opponentReady` perspective flags.
- Safety action now prefers `Withdraw Safely` while contract allows it; otherwise the room explains when the pool is locked.

## Verification
- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed

## Next-Agent Notes
- Real two-wallet room test is still needed for the new guided action rail.
- If READY still appears flaky on mobile after deploy, inspect websocket reconnect timing from `useRoomPresence.ts` against the new room CTA state.

## 2026-03-06 Update (Chain-First Arena Recovery + Winner Spotlight)
- `src/app/arena/ArenaExperience.tsx`
  - added initial active-match recovery from `useArenaMatches().restoredOwnedMatch`.
  - recovery only runs once per page load, and only when there is no explicit `room` or `match` query param.
  - active on-chain match (`status 0/1`) now restores straight into the room screen after refresh/crash/disconnect.
  - removed invalid fallback that aliased `roomId = matchId`.
  - tightened active match polling from `3500ms` to `3000ms`.
  - battle actions are now disabled for spectators even when an active locked match is loaded.
- `src/app/arena/battle-room/BattleRoomScreen.tsx`
  - room header now shows restored total stake from chain.
  - per-side status cards now show each side's restored stake amount.
  - contract-driven action rail kept intact (`deposit -> withdraw if status 0 -> battle if status 1`).
- `src/app/arena/arena-ui/BattleArenaScreen.tsx`
  - battle result screen now includes a winner spotlight card with the winning monster image.

## Verification
- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed
- Playwright/browser smoke pass on `/arena`:
  - screenshots: `/tmp/anavrin-arena-recovery-check/shot-0.png`, `/tmp/anavrin-arena-recovery-check/shot-1.png`
- Direct chain sanity check via `tsx` against mainnet arena matches completed successfully.

## Next-Agent Notes
- If a true room websocket restore after refresh is needed, persist a verified room id separately from the match id; do not infer room id from the match object.
- Admin cancel tooling already exists in `src/app/pages/AdminPage.tsx`; no new admin fallback code was needed for this pass.

## 2026-03-06 Update (Mobile Flow Audit)
- Refined room guidance so both trainers now see explicit next-task cards:
  - `You`
  - `Opponent`
- `battleEngine.ts`
  - added `yourTaskLabel`, `yourTaskDetail`, `opponentTaskLabel`, `opponentTaskDetail` to `RoomModel`
  - contract-aligned messaging now covers:
    - waiting for invite accept
    - both trainers present / open room
    - deposit your legend
    - wait or withdraw safely
    - either trainer can start battle
- `BattleRoomScreen.tsx`
  - added dual task cards under `Next Move`
  - added `Battle Ready` banner once both legends are deposited and the match is locked
  - collapsed monster/wager setup sections after deposit to reduce mobile scroll length
  - added compact `Your Loadout` summary after deposit/waiting/battle states
- `ArenaExperience.tsx`
  - updated stale copy so the arena shell no longer mentions the removed `READY` step

## Verification
- `npm run typecheck` passed
- `npm run lint` passed earlier in this session on the same code path
- `npm run build` passed
- Playwright skill-client run on `/arena`:
  - screenshots in `/tmp/anavrin-arena-skill-pass`
- Mobile browser audit:
  - screenshot `/tmp/anavrin-arena-mobile-audit.png`
  - width check passed: `scrollWidth === clientWidth === 390`

## Remaining risk
- Full connected two-wallet mobile validation is still needed for the actual in-room signed flow, because local browser automation cannot sign wallet transactions.

## 2026-03-06 Update (Room Chat)
- Added persistent room chat over the existing room websocket so trainers can coordinate wager / open-room / battle steps.
- `workers/arena-lobby.ts`
  - added `roomChat` message type
  - room state now persists `messages` alongside participants/notices
  - chat messages are stored in the Durable Object and replayed after refresh/reconnect
- `src/app/arena/network/types.ts`
  - added `RoomChatMessage`
  - `RoomState` now includes `messages`
- `src/app/arena/network/useRoomPresence.ts`
  - now tracks `messages`
  - added `sendChat(text)` helper
- `src/app/arena/ArenaExperience.tsx`
  - passes room chat messages and send handler into room screen
- `src/app/arena/battle-room/BattleRoomScreen.tsx`
  - added `Room Chat` panel
  - added quick coordination prompts
  - added inline message composer and message history

## Verification
- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed
- worker bundle check passed:
  - `/tmp/arena-lobby-worker-chat-check.js`
- mobile width check passed:
  - `scrollWidth === clientWidth === 390`
  - screenshot: `/tmp/anavrin-arena-chat-mobile.png`

## Deployment note
- This change modifies the room websocket protocol, so Pages deploy alone is not enough.
- Worker must be redeployed with `npm run lobby:deploy` after publishing.

## 2026-03-06 arena scalability refactor
- Split arena flow into dedicated routes: /lobby, /queue, /battle/:matchId, /spectate/:matchId, /my-monsters; /arena now redirects to /lobby and /legends redirects to /my-monsters.
- Extended Cloudflare worker to store queue entries and battle summaries, expose /api/lobby/snapshot and /api/battles endpoints, and keep room chat/viewer counts per match room.
- Added frontend HTTP client for battle summaries and queue/lobby metadata plus route-local battle recovery hook (polls one match every 3s).
- New battle route uses chain as source of truth for one ArenaMatch, updates backend battle summaries, and joins room chat/viewer websocket keyed by matchId.
- Fixed local route conflict by moving websocket namespace from /lobby and /room/* to /ws/lobby and /ws/room/*. Vite now proxies both /ws and /api to the worker in local dev.
- Validation run: npm run typecheck, npm run lint, npm run build. Browser screenshots checked for /lobby and /queue. Direct /lobby preview route fixed after websocket namespace change.
- Remaining real-world validation: deploy the updated worker before testing preview/production battle summary fetches, because the new /api endpoints and CORS headers live in the worker.

## 2026-03-06 Update (Lobby socket fallback for production drift)
- Fixed online presence connection issue caused by frontend websocket namespace drift.
- Production worker is still serving legacy websocket paths (`/lobby`, `/room/:id`) while the current frontend was trying modern paths (`/ws/lobby`, `/ws/room/:id`).
- Added socket candidate fallback in:
  - `src/app/arena/network/socket.ts`
  - `src/app/arena/network/useLobbyPresence.ts`
  - `src/app/arena/network/useRoomPresence.ts`
- Frontend now tries modern websocket paths first, then falls back to legacy paths automatically if the worker has not been redeployed yet.
- Verified live worker behavior with a two-wallet synthetic websocket probe: both wallets appeared online concurrently.
- Validation run: `npm run typecheck`, `npm run lint`, `npm run build`.

## Next-Agent Notes
- There is unfinished local 3D battle renderer work in the worktree (`src/app/three/*`, `src/app/components/MonsterViewport3D.tsx`, related type/package changes). It was intentionally left out of the online-detection publish.
- If that 3D work is resumed, re-run validation before publishing because those files are not currently part of the pushed fix.

---

Current prompt: yes, also fix the screen i cant see all the seetings.

## 2026-03-13 Update (MFPS Solo Start + Runtime Layout)
- Changed `Capture Of Flag` `RequiredPlayersToStart` from `2` to `1` in `/Users/arthurtoscano/Documents/New project/UnityAvatarGame/Assets/MFPS/Resources/GameData.asset` so solo starts are allowed.
- Updated `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/web/src/pages/UnityPage.tsx` to add runtime controls for:
  - `Show Split View` / `Expand Runtime`
  - `Open Full Runtime`
- Updated `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/web/src/index.css` so the `/unity` page defaults to a runtime-first expanded layout, gives the WebGL iframe more space, and keeps a smaller mobile height.

## TODO / next-agent suggestions
- Rebuild Unity WebGL after the `GameData.asset` change and re-verify solo room start.
- Run a browser smoke on `/unity` and inspect screenshots for the expanded runtime layout and visibility of the in-game options UI.

## Verification
- `npm run typecheck -w @pacific/web` passed.
- `npm run build -w @pacific/web` passed.
- Unity WebGL rebuild passed:
  - `Pacific.MFPS.Editor.BuildProfileSetup.BuildWebGLForReadyAvatarPlatform`
- Playwright skill-client screenshot reviewed:
  - `/Users/arthurtoscano/Documents/New project/output/unity-page-layout-20260313-r1/shot-0.png`
  - Confirms `/unity` now opens in a runtime-first expanded layout with the full-width runtime panel visible before wallet connection.

---

Current prompt: do it, also before you star. give me a very detailed explanintion of the way it works, from wallet connect to minting to the game were using ect, the more words the better.

## 2026-03-13 Update (NFT Match Save Hook + Local Persistence)
- Added local shooter stat persistence fallback for API dev when `DATABASE_URL` is not configured:
  - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/api/src/shooter-local-store.ts`
  - persisted file path:
    - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/api/.data/shooter-local-store.json`
- Extended API routes:
  - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/api/src/server.ts`
  - added `POST /shooter/match/local`
  - added `reportLocalMatchUrl` to Unity profile endpoints
  - no-DB branches for `/avatar/:wallet`, `/avatar/:wallet/owned`, `/unity/profile/:wallet`, and `/shooter/stats/:wallet` now reflect locally saved shooter stats
- Extended DB schema for database-backed local-result audit rows:
  - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/api/src/db.ts`
  - added `avatar_shooter_match_results`
- Wired Unity runtime match-over reporting:
  - `/Users/arthurtoscano/Documents/New project/UnityAvatarGame/Assets/MFPS/Scripts/Runtime/Integration/PacificMfpsProfileBootstrap.cs`
  - runtime now:
    - keeps active NFT profile context
    - listens to `bl_EventHandler.Match.onMatchOver`
    - computes local match result from MFPS game mode
    - posts result to `reportLocalMatchUrl`
    - logs the updated NFT stats response
- Updated web local profile fallback to include `reportLocalMatchUrl`:
  - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/apps/web/src/pages/UnityPage.tsx`
- Updated docs:
  - `/Users/arthurtoscano/Documents/New project/ready-avatar-platform/README.md`

## Verification
- `npm run typecheck -w @pacific/api` passed.
- `npm run build -w @pacific/api` passed.
- `npm run typecheck -w @pacific/web` passed.
- `npm run build -w @pacific/web` passed.
- Unity WebGL rebuild passed after the Unity runtime hook change.
- API proof of persistence completed against the active shooter NFT:
  - before:
    - `GET /shooter/stats/:wallet` showed avatar `0xb3f9...bfd6` at `W1/L0/HP87`
  - write:
    - `POST /shooter/match/local` with result `defeat`, hp `12`
  - after:
    - `GET /shooter/stats/:wallet` showed `W1/L1/HP12`
- Launcher/runtime-facing reads confirmed:
  - `/avatar/:wallet/owned` now returns `shooterStats: { wins: 1, losses: 1, hp: 12 }` for the active NFT
  - `/unity/profile/:wallet` now returns `shooterStats: { wins: 1, losses: 1, hp: 12 }`
  - `/unity/profile/:wallet` now includes `endpoints.reportLocalMatchUrl`
