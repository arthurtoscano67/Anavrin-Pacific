## Critical fixes for your pasted `App` component

### 1) Define `MARKETPLACE_ID` (currently missing)

Your code calls `MARKETPLACE_ID` in multiple places but never defines it, which will throw immediately.

```ts
const MARKETPLACE_ID  = "0xYOUR_MARKETPLACE_SHARED_OBJECT_ID";
```

Add it near your other config constants.

---

### 2) Normalize mint config fields once, then use consistent keys

Right now you read both `mint_price_mist` and `price` in different places. If on-chain fields don’t match exactly, UI and tx building drift.

Add helper:

```ts
const normalizeMintConfig = (fields) => {
  if (!fields) return null;
  const priceMist = fields.mint_price_mist ?? fields.price ?? 0;
  return {
    ...fields,
    price_mist: priceMist,
    enabled: Boolean(fields.enabled ?? fields.mint_enabled ?? false),
    total_minted: Number(fields.total_minted ?? 0),
    royalty_bps: Number(fields.royalty_bps ?? 0),
  };
};
```

Update `fetchConfig`:

```ts
const fields = obj.data?.content?.fields;
if (fields) setMintConfig(normalizeMintConfig(fields));
```

Then use `mintConfig.price_mist` everywhere:

- Mint price badge: `formatSui(mintConfig.price_mist)`
- Mint tx amount: `BigInt(mintConfig?.price_mist || 0)`
- Admin current price: `formatSui(mintConfig.price_mist)`

---

### 3) Fix marketplace event types (currently incorrect)

In `fetchListings`, comment says list/buy/delist events, but code queries unrelated event types (`MintEvent`, `BattleOutcome`, `BreedEvent`). That makes listings reconstruction wrong.

Replace:

```ts
const [listEvts, buyEvts, delistEvts] = await Promise.all([
  client.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::monster::ListEvent` }, limit: 200 }),
  client.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::monster::BuyEvent` }, limit: 200 }),
  client.queryEvents({ query: { MoveEventType: `${PACKAGE_ID}::monster::DelistEvent` }, limit: 200 }),
]);
```

---

### 4) Optional safety checks before sending marketplace txs

Guard list/buy/delist calls if marketplace config is unset:

```ts
if (!MARKETPLACE_ID || MARKETPLACE_ID.startsWith("0xYOUR_")) {
  setError("Marketplace is not configured");
  return;
}
```

Apply in:

- `ListModal.handleList`
- `BuyModal.handleBuy`
- `MarketplaceTab.handleDelist`

---

### 5) Minor cleanup

- Remove unused imports/vars: `SuiClient`, `account` in modals, `client` in `BuyModal`, `SUI_NETWORK` if not used.
- Reset NFT image loading when ID changes:

```ts
useEffect(() => setLoaded(false), [src]);
```

