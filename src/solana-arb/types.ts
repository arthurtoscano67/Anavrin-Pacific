import type { AddressLookupTableAccount, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

export type CommitmentLevel = "processed" | "confirmed" | "finalized";

export interface ArbRouteConfig {
  name: string;
  baseMint: string;
  midMint: string;
  tradeAmountAtomic: bigint;
}

export interface JupiterQuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  dexes?: string[];
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: bigint;
  outAmount: bigint;
  priceImpactPct: number;
  routePlan: Array<{
    swapInfo?: {
      label?: string;
      inputMint?: string;
      outputMint?: string;
      inAmount?: string;
      outAmount?: string;
      feeAmount?: string;
      feeMint?: string;
    };
    percent?: number;
  }>;
  raw: Record<string, unknown>;
}

export interface SwapInstructionSet {
  setupInstructions: TransactionInstruction[];
  swapInstruction: TransactionInstruction;
  cleanupInstructions: TransactionInstruction[];
  lookupTableAddresses: string[];
}

export interface Opportunity {
  route: ArbRouteConfig;
  buyDex: string;
  sellDex: string;
  amountIn: bigint;
  leg1: JupiterQuote;
  leg2: JupiterQuote;
  expectedOut: bigint;
  expectedProfitAtomic: bigint;
  expectedProfitBps: number;
  scannedAt: string;
}

export interface BuildTxResult {
  tx: VersionedTransaction;
  lookupTables: AddressLookupTableAccount[];
  instructionCount: number;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface SimulationResult {
  ok: boolean;
  err: unknown;
  logs: string[];
  unitsConsumed: number;
}

export interface CycleOutcome {
  detectedCount: number;
  bestOpportunity: Opportunity | null;
  simulated: SimulationResult | null;
  executedSignature: string | null;
  cycleLatencyMs: number;
}

export interface WalletWorker {
  label: string;
  secretKey: Uint8Array;
}
