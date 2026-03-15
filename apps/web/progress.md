Original prompt: lets make in minimalist, mobile friendly for app store. do not guess, lets only have what we need. buttons have the text, easy scroll, no need to have stuff user doesnt not neeed to see, the flow should be easy. first page user chooses direction followed by prompts, easy flow, you are also a graphics designer. the app looks beautful and game like, COD, Battlefield, so it feels like you on a game app and not a barnes and noble

- Rebuilt the web shell around a minimal mobile-first flow.
- `App.tsx` is now a direction-first mint experience: choose path, connect wallet, pick operator, optional uploads, mint.
- `UnityPage.tsx` is now a simplified launcher: owned operators, selected NFT summary, runtime stage, advanced Photon controls hidden.
- `SiteTabs.tsx` now exposes `Home`, `Mint`, and `Play`.
- CSS was extended with a new game-style responsive layout layer for the rewritten pages.
- Verified `npm run typecheck -w @pacific/web`.
- Verified `npm run build -w @pacific/web`.
- Ran the required Playwright client against `/` and `/unity` with screenshot output in:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-root-20260314-r1`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-unity-20260314-r1`
- Captured additional full-page review screenshots in:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-review-20260314-r1/root-desktop.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-review-20260314-r1/root-mobile.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-review-20260314-r1/unity-desktop.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-review-20260314-r1/unity-mobile.png`
- Visual result: the new flow reads well on mobile and desktop, with direction-first navigation and a shorter vertical path.

Follow-up prompt: do not copy the photo, just use it as reference, I like when apps use he state variable that tracks which step you are on is called phase. The function that triggers the transition to the next step is called nextPhase. So user is not overwelmed by so many things they can do. Example, "home" gives 2 options. "Mint" and "Play" in Mint page. "Mint Operator" below "Extend Opereator" next to that. when user chooses. it goes to next phases. Example, Choose operator, choose name and description, mint operator. should feel fun to make and cool

- Reworked `App.tsx` into a true phase-driven flow.
- Added `phase` as the UI state machine and `nextPhase` for forward progression.
- Home phase now exposes only two directions: `Mint` and `Play`.
- Mint phase now exposes only two actions: `Mint Operator` and `Extend Operator`.
- Mint operator flow is now sequential:
  - `choose-operator`
  - `identity`
  - `mint-operator`
  - `minted`
- Added `previousPhase` back navigation for the guided mint path.
- Mint success no longer auto-jumps away; it lands in a `minted` confirmation phase with next actions.
- Extend flow now lives inside its own `extend-operator` phase on the create side.
- CSS was expanded with new phase-shell layout styles and progress UI while keeping the dark tactical visual language.
- Verified `npm run typecheck -w @pacific/web`.
- Verified `npm run build -w @pacific/web`.
- Ran the required Playwright client again on the updated phased flow:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-client-20260314-r1/home`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-client-20260314-r1/choose-operator`
- Captured and reviewed additional phase screenshots:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-20260314-r2/home-desktop.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-20260314-r2/mint-menu-desktop.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-20260314-r2/choose-operator-desktop.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-phase-20260314-r2/identity-desktop.png`
- Visual result: the create flow now reads as a controlled operator-build sequence instead of a dashboard with parallel options.

Follow-up prompt: When user is on Play game and wallet is connected, should say loading characters. when user selects character, play button comes out and it opens new screen for gaming, not on play page to keep it from playing on 2 screens

- Split the play experience into two screens:
  - `/unity` is now the clean selector screen only
  - `/world` is the dedicated runtime tab for gameplay
- Updated the mint success launch target to `/world` so launches no longer route back into the selector page.
- Added `fullscreen=1` to both play-page launches and post-mint launches so the dedicated runtime tab can attempt fullscreen immediately.
- Simplified `UnityPage.tsx` so the selector page only focuses on:
  - loading characters
  - selecting a character
  - pressing `Play Game`
- The selector now says `Loading characters.` while owned NFTs are being resolved.
- Pressing `Play Game` opens the runtime in a new tab instead of embedding the game on the play page.
- The runtime tab is now a dedicated full-viewport shell with a back button and fullscreen action instead of the old mixed launcher/dashboard layout.
- Added a best-effort fullscreen request on the runtime route when launched with `fullscreen=1`, plus a visible `Fullscreen` button in the game tab.
- Removed unused advanced launcher and renewal UI from the play screen to keep the experience focused.
- Follow-up adjustment: `Play Game` now stays in the same tab and navigates directly into the dedicated runtime screen. The "new tab" wording was removed from the selector UI.
- Verified `npm run typecheck -w @pacific/web`.
- Verified `npm run build -w @pacific/web`.
- Ran the required Playwright client against the split flow:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-play-split-20260314-r1/unity`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-play-split-20260314-r1/world`
- Reviewed screenshots:
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-play-split-20260314-r1/unity/shot-1.png`
  - `/Users/arthurtoscano/Documents/New project/output/web-ui-play-split-20260314-r1/world/shot-1.png`
- Visual result: play selection is now reduced to character loading, character choice, and one launch action, with gameplay isolated to its own tab.

TODO / next-agent notes:
- If mobile spacing still feels too dense, reduce hero copy height before touching card density.
- Consider a future pass to reskin the Unity WebGL template itself so the loader matches the new shell.
- If a later pass wants more energy, tighten the vertical dead space in `choose-operator` and `identity` before adding new content.
- Browser fullscreen remains browser-controlled. The new tab attempts it and also exposes a clear fullscreen button in the runtime shell.
