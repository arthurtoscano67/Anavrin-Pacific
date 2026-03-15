export const PACKAGE_ID = "0x2ca61670c77b0fb32ab2b62b209d260531a1303936e365ae3154bc3d0eb7ec48";
export const GAME_CONFIG_ID = "0x1c082b4892d69243c7a55c59cee9a7da140b798c5a9af2baabf74411b281cecc";
export const TREASURY_ID = GAME_CONFIG_ID;
export const ADMIN_CAP_ID = "0xd2a2f18520a50574300227dca665af955cc2704a14496a45ab5632e503fb55a5";
export const DISPLAY_ID = "0x213450da8ef24ee08e857f1f308a3d27623d7316ac4c795e389851cdf0199c43";
export const CLOCK_ID = "0x6";
export const MODULE = "martian";
export const ITEMS_PACKAGE_ID = "0x948d0f354923a0dfd2b751894773af811b8535368936aa1801371cf986005cb1";
export const ITEMS_TREASURY_ID = "0x15ff12dc26b88b46e2145e678ce9d7dd864383c1cae21b60a3290716e8aa6ce5";
export const ITEMS_ADMIN_CAP_ID = "0x0d9d645e85218c26e74ec689db8e99476e12d67c31cf0f8b986733124da8f162";
export const ITEMS_MODULE = "items";
export const RENDERER = "https://martians-renderer-production.up.railway.app";
export const SUI_NETWORK = "mainnet";
export const SUI_DECIMALS = 1_000_000_000;

export const MONSTER_TYPE = `${PACKAGE_ID}::${MODULE}::Martian`;
export const TREASURY_TYPE = `${PACKAGE_ID}::${MODULE}::GameConfig`;
export const ADMIN_CAP_TYPE = `${PACKAGE_ID}::${MODULE}::AdminCap`;
export const ARENA_MATCH_TYPE = `${PACKAGE_ID}::${MODULE}::MartianMatch`;
export const ITEM_TYPE = `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::Item`;
export const ITEM_DEFINITION_TYPE = `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::ItemDefinition`;
export const ITEMS_TREASURY_TYPE = `${ITEMS_PACKAGE_ID}::${ITEMS_MODULE}::Treasury`;
export const NORMAL_BATTLE_MODE = 0;

export const STAGE_META: Record<number, { label: string; color: string; emoji: string }> = {
  0: { label: "Spirit", color: "bg-stageEgg/20 text-stageEgg border-stageEgg/40", emoji: "👽" },
  1: { label: "Guardian", color: "bg-stageBaby/20 text-stageBaby border-stageBaby/40", emoji: "🛡️" },
  2: { label: "Enlightened", color: "bg-stageAdult/20 text-stageAdult border-stageAdult/40", emoji: "✨" },
  3: { label: "Ascended", color: "bg-stageLegend/20 text-stageLegend border-stageLegend/40", emoji: "👑" },
};

export const ROUTES = [
  { path: "/", label: "Mint" },
  { path: "/my-monsters", label: "My Martians" },
  { path: "/items", label: "Items" },
  { path: "/breeding", label: "Breeding" },
  { path: "/gallery", label: "Gallery" },
  { path: "/lobby", label: "Lobby" },
  { path: "/queue", label: "Queue" },
  { path: "/market", label: "Marketplace" },
  { path: "/leaderboard", label: "Leaderboard" },
  { path: "/admin", label: "Admin" },
] as const;
