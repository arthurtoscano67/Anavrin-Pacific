"use client";

import { useMemo, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";

import { MonsterCard } from "@/components/monster-card";
import { StatCard } from "@/components/stat-card";
import { WalletGate } from "@/components/wallet-gate";
import { formatSui, stageLabel } from "@/lib/format";
import { useContractActions } from "@/hooks/use-contract-actions";
import { useMonsterPortfolio } from "@/hooks/use-monster-portfolio";

export default function MyMonstersPage() {
  const account = useCurrentAccount();
  const [breedA, setBreedA] = useState("");
  const [breedB, setBreedB] = useState("");
  const [listMonsterId, setListMonsterId] = useState("");
  const [listKioskCapId, setListKioskCapId] = useState("");
  const [listPriceSui, setListPriceSui] = useState("");
  const [adminPrice, setAdminPrice] = useState("");
  const [withdrawTo, setWithdrawTo] = useState(account?.address ?? "");

  const portfolio = useMonsterPortfolio(account?.address);
  const actions = useContractActions();

  const selectedKiosk = useMemo(
    () => portfolio.kiosks.find((kiosk) => kiosk.ownerCapId === listKioskCapId),
    [listKioskCapId, portfolio.kiosks]
  );

  if (!account) {
    return (
      <WalletGate
        title="Connect your Sui wallet"
        subtitle="Use Slush or Suiet to load wallet and kiosk monsters, battle readiness, and breeding actions."
      />
    );
  }

  const mintPriceMist = portfolio.mintConfig?.mintPriceMist ?? "0";
  const mintEnabled = portfolio.mintConfig?.mintEnabled ?? false;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-4">
        <StatCard label="Wallet Monsters" value={portfolio.walletMonsters.length} />
        <StatCard label="Kiosk Monsters" value={portfolio.kioskMonsters.length} />
        <StatCard label="Owned Kiosks" value={portfolio.kiosks.length} />
        <StatCard label="Mint Price" value={`${formatSui(mintPriceMist)} SUI`} tone="pulse" />
      </section>

      {actions.error && (
        <div className="rounded-lg border border-ember/50 bg-ember/15 px-3 py-2 text-sm text-ember">
          {actions.error}
        </div>
      )}

      <section className="panel space-y-4">
        <h2 className="text-2xl font-semibold">Mint + Breed</h2>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn btn-primary"
            disabled={!mintEnabled || actions.pending !== null}
            onClick={async () => {
              await actions.mintByMist(mintPriceMist);
              await portfolio.refetch();
            }}
          >
            {mintEnabled ? `Mint (${formatSui(mintPriceMist)} SUI)` : "Mint paused"}
          </button>
          <button
            className="btn btn-secondary"
            disabled={actions.pending !== null}
            onClick={async () => {
              await actions.createKiosk();
              await portfolio.refetch();
            }}
          >
            Create Kiosk
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <select className="input" value={breedA} onChange={(event) => setBreedA(event.target.value)}>
            <option value="">Parent A</option>
            {portfolio.walletMonsters.map((monster) => (
              <option key={monster.objectId} value={monster.objectId}>
                {monster.name} ({stageLabel(monster.stage)})
              </option>
            ))}
          </select>
          <select className="input" value={breedB} onChange={(event) => setBreedB(event.target.value)}>
            <option value="">Parent B</option>
            {portfolio.walletMonsters
              .filter((monster) => monster.objectId !== breedA)
              .map((monster) => (
                <option key={monster.objectId} value={monster.objectId}>
                  {monster.name} ({stageLabel(monster.stage)})
                </option>
              ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!breedA || !breedB || actions.pending !== null}
            onClick={async () => {
              await actions.breed(breedA, breedB);
              setBreedA("");
              setBreedB("");
              await portfolio.refetch();
            }}
          >
            Breed
          </button>
          <button className="btn btn-secondary" onClick={() => void portfolio.refetch()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="panel space-y-4">
        <h2 className="text-2xl font-semibold">List Wallet Monster to Kiosk</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            className="input"
            value={listMonsterId}
            onChange={(event) => setListMonsterId(event.target.value)}
          >
            <option value="">Select Monster</option>
            {portfolio.walletMonsters.map((monster) => (
              <option key={monster.objectId} value={monster.objectId}>
                {monster.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={listKioskCapId}
            onChange={(event) => setListKioskCapId(event.target.value)}
          >
            <option value="">Select Kiosk Cap</option>
            {portfolio.kiosks.map((kiosk) => (
              <option key={kiosk.ownerCapId} value={kiosk.ownerCapId}>
                {kiosk.kioskId}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={listPriceSui}
            onChange={(event) => setListPriceSui(event.target.value)}
            placeholder="Price in SUI"
          />
          <button
            className="btn btn-primary"
            disabled={!listMonsterId || !listKioskCapId || !listPriceSui || actions.pending !== null}
            onClick={async () => {
              if (!selectedKiosk) return;
              await actions.listForSale(
                selectedKiosk.kioskId,
                selectedKiosk.ownerCapId,
                listMonsterId,
                listPriceSui
              );
              setListPriceSui("");
              await portfolio.refetch();
            }}
          >
            List
          </button>
        </div>
      </section>

      {portfolio.adminCapId && (
        <section className="panel space-y-4">
          <h2 className="text-2xl font-semibold">Admin Controls</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <button
              className="btn btn-secondary"
              disabled={actions.pending !== null}
              onClick={async () => {
                await actions.setMintEnabled(portfolio.adminCapId!, !mintEnabled);
                await portfolio.refetch();
              }}
            >
              {mintEnabled ? "Pause Mint" : "Enable Mint"}
            </button>
            <input
              className="input"
              value={adminPrice}
              onChange={(event) => setAdminPrice(event.target.value)}
              placeholder="Set mint price (SUI)"
            />
            <button
              className="btn btn-primary"
              disabled={!adminPrice || actions.pending !== null}
              onClick={async () => {
                await actions.setMintPrice(portfolio.adminCapId!, adminPrice);
                setAdminPrice("");
                await portfolio.refetch();
              }}
            >
              Set Mint Price
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              className="input md:col-span-2"
              value={withdrawTo}
              onChange={(event) => setWithdrawTo(event.target.value)}
              placeholder="Withdraw destination address"
            />
            <button
              className="btn btn-secondary"
              disabled={!withdrawTo || actions.pending !== null}
              onClick={async () => {
                await actions.withdrawFees(portfolio.adminCapId!, withdrawTo);
                await portfolio.refetch();
              }}
            >
              Withdraw Fees
            </button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Wallet Monsters</h2>
        {portfolio.walletMonsters.length === 0 ? (
          <div className="panel text-sm text-mist">No monsters in wallet.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {portfolio.walletMonsters.map((monster) => (
              <MonsterCard
                key={monster.objectId}
                monster={monster}
                footer={
                  <button
                    className="btn btn-secondary w-full"
                    onClick={async () => {
                      await actions.syncMonster(monster.objectId);
                      await portfolio.refetch();
                    }}
                  >
                    Sync Stage
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Kiosk Monsters</h2>
        {portfolio.kioskMonsters.length === 0 ? (
          <div className="panel text-sm text-mist">No monsters in kiosks.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {portfolio.kioskMonsters.map((monster) => (
              <MonsterCard key={monster.objectId} monster={monster} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
