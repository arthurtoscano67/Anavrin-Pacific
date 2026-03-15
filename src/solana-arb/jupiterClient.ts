import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

import type { JupiterQuote, JupiterQuoteRequest, SwapInstructionSet } from "./types.js";

interface RawAccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface RawInstruction {
  programId: string;
  accounts: RawAccountMeta[];
  data: string;
}

interface SwapInstructionsResponse {
  computeBudgetInstructions?: RawInstruction[];
  setupInstructions?: RawInstruction[];
  swapInstruction?: RawInstruction;
  cleanupInstruction?: RawInstruction | null;
  otherInstructions?: RawInstruction[];
  addressLookupTableAddresses?: string[];
}

interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string;
  routePlan?: Array<{
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
}

export class JupiterClient {
  constructor(
    private readonly apiBase: string,
    private readonly timeoutMs: number,
  ) {}

  async quote(req: JupiterQuoteRequest): Promise<JupiterQuote | null> {
    const quoteUrl = new URL(`${this.apiBase.replace(/\/$/, "")}/quote`);
    quoteUrl.searchParams.set("inputMint", req.inputMint);
    quoteUrl.searchParams.set("outputMint", req.outputMint);
    quoteUrl.searchParams.set("amount", req.amount.toString());
    quoteUrl.searchParams.set("slippageBps", String(req.slippageBps));
    quoteUrl.searchParams.set("swapMode", "ExactIn");

    if (req.dexes && req.dexes.length > 0) {
      quoteUrl.searchParams.set("dexes", req.dexes.join(","));
    }

    let payload: QuoteResponse;
    try {
      payload = await this.fetchJson<QuoteResponse>(quoteUrl.toString(), {
        method: "GET",
      });
    } catch (error) {
      if (isHttpStatus(error, 401) || isHttpStatus(error, 403) || isHttpStatus(error, 429)) {
        throw error;
      }
      return null;
    }

    if (!payload?.outAmount || !payload?.inAmount) {
      return null;
    }

    let inAmount: bigint;
    let outAmount: bigint;
    try {
      inAmount = BigInt(payload.inAmount);
      outAmount = BigInt(payload.outAmount);
    } catch {
      return null;
    }

    return {
      inputMint: payload.inputMint,
      outputMint: payload.outputMint,
      inAmount,
      outAmount,
      priceImpactPct: Number.parseFloat(payload.priceImpactPct ?? "0") || 0,
      routePlan: payload.routePlan ?? [],
      raw: payload as unknown as Record<string, unknown>,
    };
  }

  async buildSwapInstructions(args: {
    quote: JupiterQuote;
    userPublicKey: PublicKey;
    dynamicComputeUnitLimit?: boolean;
    wrapAndUnwrapSol?: boolean;
  }): Promise<SwapInstructionSet> {
    const payload = await this.fetchJson<SwapInstructionsResponse>(
      `${this.apiBase.replace(/\/$/, "")}/swap-instructions`,
      {
        method: "POST",
        body: JSON.stringify({
          quoteResponse: args.quote.raw,
          userPublicKey: args.userPublicKey.toBase58(),
          dynamicComputeUnitLimit: args.dynamicComputeUnitLimit ?? false,
          wrapAndUnwrapSol: args.wrapAndUnwrapSol ?? true,
          useSharedAccounts: true,
        }),
      },
    );

    if (!payload?.swapInstruction) {
      throw new Error("Jupiter swap-instructions did not return swapInstruction.");
    }

    const setup = payload.setupInstructions ?? [];
    const cleanup = payload.cleanupInstruction ? [payload.cleanupInstruction] : [];
    const other = payload.otherInstructions ?? [];
    const computeBudget = payload.computeBudgetInstructions ?? [];

    return {
      setupInstructions: [...computeBudget, ...setup, ...other].map((ix) => deserializeInstruction(ix)),
      swapInstruction: deserializeInstruction(payload.swapInstruction),
      cleanupInstructions: cleanup.map((ix) => deserializeInstruction(ix)),
      lookupTableAddresses: payload.addressLookupTableAddresses ?? [],
    };
  }

  async fetchLookupTables(connection: Connection, addresses: string[]): Promise<AddressLookupTableAccount[]> {
    const deduped = [...new Set(addresses.filter(Boolean))];
    if (deduped.length === 0) {
      return [];
    }

    const keys = deduped.map((address) => new PublicKey(address));
    const infos = await connection.getMultipleAccountsInfo(keys);

    const result: AddressLookupTableAccount[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const info = infos[i];
      if (!info) {
        continue;
      }

      try {
        const state = AddressLookupTableAccount.deserialize(info.data);
        result.push(new AddressLookupTableAccount({ key: keys[i], state }));
      } catch {
        // Ignore malformed lookup table accounts and continue.
      }
    }

    return result;
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const error = new Error(`HTTP ${response.status}: ${text}`) as Error & {
          status: number;
          body: string;
        };
        error.status = response.status;
        error.body = text;
        throw error;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isHttpStatus(error: unknown, statusCode: number): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeStatus = Reflect.get(error, "status");
  return Number(maybeStatus) === statusCode;
}

function deserializeInstruction(raw: RawInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(raw.programId),
    keys: raw.accounts.map((meta) => ({
      pubkey: new PublicKey(meta.pubkey),
      isSigner: meta.isSigner,
      isWritable: meta.isWritable,
    })),
    data: Buffer.from(raw.data, "base64"),
  });
}
