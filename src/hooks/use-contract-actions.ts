"use client";

import { useCallback, useState } from "react";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_ID, DISPLAY_ID, PACKAGE_ID, TREASURY_ID } from "@/lib/config";
import { toMist } from "@/lib/format";

function errorMessage(error: unknown): string {
  if (!error) return "Unknown transaction error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Transaction failed";
}

export function useContractActions() {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (label: string, build: (tx: Transaction) => void) => {
      setPending(label);
      setError(null);
      try {
        const tx = new Transaction();
        build(tx);
        await signAndExecute({ transaction: tx });
      } catch (e) {
        const message = errorMessage(e);
        setError(message);
        throw new Error(message);
      } finally {
        setPending(null);
      }
    },
    [signAndExecute]
  );

  return {
    pending,
    error,
    clearError: () => setError(null),
    mintByMist: (priceMist: string) =>
      run("mint", (tx) => {
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceMist)]);
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::mint`,
          arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), coin],
        });
      }),
    mint: (priceSui: string) =>
      run("mint", (tx) => {
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(toMist(priceSui))]);
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::mint`,
          arguments: [tx.object(TREASURY_ID), tx.object(CLOCK_ID), coin],
        });
      }),
    syncMonster: (monsterId: string) =>
      run("sync", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::hatch`,
          arguments: [tx.object(monsterId), tx.object(CLOCK_ID)],
        });
      }),
    breed: (monsterAId: string, monsterBId: string) =>
      run("breed", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::breed`,
          arguments: [tx.object(monsterAId), tx.object(monsterBId), tx.object(CLOCK_ID)],
        });
      }),
    createKiosk: () =>
      run("create_kiosk", (tx) => {
        tx.moveCall({ target: `${PACKAGE_ID}::monster::create_kiosk`, arguments: [] });
      }),
    listForSale: (kioskId: string, kioskOwnerCapId: string, monsterId: string, priceSui: string) =>
      run("list_for_sale", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::list_for_sale`,
          arguments: [
            tx.object(kioskId),
            tx.object(kioskOwnerCapId),
            tx.object(monsterId),
            tx.pure.u64(toMist(priceSui)),
          ],
        });
      }),
    createMatch: (opponentAddress: string) =>
      run("create_match", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::create_match`,
          arguments: [tx.pure.address(opponentAddress), tx.object(CLOCK_ID)],
        });
      }),
    depositMonster: (matchId: string, monsterId: string) =>
      run("deposit_monster", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::deposit_monster`,
          arguments: [tx.object(matchId), tx.object(monsterId), tx.object(CLOCK_ID)],
        });
      }),
    depositStake: (matchId: string, stakeSui: string) =>
      run("deposit_stake", (tx) => {
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(toMist(stakeSui))]);
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::deposit_stake`,
          arguments: [tx.object(matchId), coin, tx.object(CLOCK_ID)],
        });
      }),
    startBattle: (matchId: string) =>
      run("start_battle", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::start_battle`,
          arguments: [tx.object(matchId), tx.object(TREASURY_ID), tx.object(CLOCK_ID)],
        });
      }),
    setMintEnabled: (adminCapId: string, enabled: boolean) =>
      run("set_mint_enabled", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::set_mint_enabled`,
          arguments: [tx.object(TREASURY_ID), tx.object(adminCapId), tx.pure.bool(enabled)],
        });
      }),
    setMintPrice: (adminCapId: string, priceSui: string) =>
      run("set_mint_price", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::set_mint_price`,
          arguments: [tx.object(TREASURY_ID), tx.object(adminCapId), tx.pure.u64(toMist(priceSui))],
        });
      }),
    withdrawFees: (adminCapId: string, destinationAddress: string) =>
      run("withdraw_fees", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::withdraw_fees`,
          arguments: [tx.object(TREASURY_ID), tx.object(adminCapId), tx.pure.address(destinationAddress)],
        });
      }),
    updateDisplay: (adminCapId: string, imageUrlTemplate: string) =>
      run("update_display", (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::monster::update_display`,
          arguments: [tx.object(adminCapId), tx.object(DISPLAY_ID), tx.pure.string(imageUrlTemplate)],
        });
      }),
  };
}
