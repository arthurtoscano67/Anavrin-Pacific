export const APP_NAME = "Anavrin Legends";
export const APP_DESCRIPTION =
  "Anavrin Legends NFT battle arena on Sui with wallet + kiosk inventory, breeding, and live PvP coordination.";

export const SUI_NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as "mainnet" | "testnet" | "devnet") ||
  "mainnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_PACKAGE_ID ||
  "0x51abc7016876cd23efcd5a5240bc03ef0e3ed4538e0d87a029944d45cb3e4b81";

export const TREASURY_ID =
  process.env.NEXT_PUBLIC_TREASURY_ID ||
  "0x414bd328952f9ddfde568e0a256476a0e2e148b21b606892f07ea3dd4360baeb";

export const ADMIN_CAP_ID =
  process.env.NEXT_PUBLIC_ADMIN_CAP_ID ||
  "0x746ab4a8c595b0ef3008fe062af780aa36eeac1ff6543603c5f248324a229776";

export const DISPLAY_ID =
  process.env.NEXT_PUBLIC_DISPLAY_ID ||
  "0xda8656ee556049f5c96579340240a7da76654d02daf4b49808d00c6432dd72d8";

export const CLOCK_ID = "0x6";
export const SUI_DECIMALS = 1_000_000_000;

export const MONSTER_TYPE = `${PACKAGE_ID}::monster::Monster`;
export const ADMIN_CAP_TYPE = `${PACKAGE_ID}::monster::AdminCap`;

export const STAGE_META = [
  { id: 0, name: "Egg", emoji: "🥚" },
  { id: 1, name: "Baby", emoji: "🌱" },
  { id: 2, name: "Adult", emoji: "⚔️" },
  { id: 3, name: "Legend", emoji: "✨" },
] as const;

export const EQUIPMENT_SLOTS = [
  "hat",
  "shirt",
  "pants",
  "shoes",
  "armor",
  "suit",
] as const;

export const RENDERER_BASE =
  process.env.NEXT_PUBLIC_RENDERER_BASE ||
  "https://martians-renderer-production.up.railway.app";
