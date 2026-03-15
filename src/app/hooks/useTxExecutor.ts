import { useCallback } from "react";
import { toast } from "sonner";
import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

function parseError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Transaction failed";
}

export function useTxExecutor() {
  const { mutateAsync } = useSignAndExecuteTransaction();
  const client = useSuiClient();

  const execute = useCallback(
    async (tx: Transaction, successMessage?: string) => {
      const loadingId = toast.loading("Awaiting wallet signature...");
      try {
        const result = (await mutateAsync({ transaction: tx })) as { digest?: string };
        const digest = result.digest;
        if (!digest) throw new Error("Missing transaction digest");

        toast.loading("Transaction submitted...", { id: loadingId });
        await client.waitForTransaction({ digest });
        if (successMessage) {
          toast.success(successMessage, { id: loadingId });
        } else {
          toast.success("Transaction succeeded", { id: loadingId });
        }
        return digest;
      } catch (error) {
        toast.error(parseError(error), { id: loadingId });
        throw error;
      }
    },
    [client, mutateAsync]
  );

  const executeAndFetchBlock = useCallback(
    async (tx: Transaction, successMessage?: string) => {
      const digest = await execute(tx, successMessage);
      const block = await client.getTransactionBlock({
        digest,
        options: {
          showObjectChanges: true,
          showEffects: true,
          showEvents: true,
        },
      });
      return { digest, block };
    },
    [client, execute]
  );

  return { execute, executeAndFetchBlock };
}
