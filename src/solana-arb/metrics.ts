import { appendFile } from "node:fs/promises";

import type { CycleOutcome, Opportunity } from "./types.js";

export interface MetricsSnapshot {
  startedAt: string;
  cycles: number;
  opportunitiesDetected: number;
  simulationsPassed: number;
  simulationsFailed: number;
  executionsSucceeded: number;
  executionsFailed: number;
  grossExpectedProfitAtomic: string;
  avgCycleLatencyMs: number;
}

export class MetricsTracker {
  private readonly startedAt = new Date().toISOString();
  private cycles = 0;
  private opportunitiesDetected = 0;
  private simulationsPassed = 0;
  private simulationsFailed = 0;
  private executionsSucceeded = 0;
  private executionsFailed = 0;
  private grossExpectedProfitAtomic = 0n;
  private totalCycleLatencyMs = 0;

  constructor(private readonly metricsFilePath?: string) {}

  recordDetection(count: number): void {
    this.opportunitiesDetected += Math.max(0, count);
  }

  recordOpportunity(opp: Opportunity | null): void {
    if (!opp) {
      return;
    }

    if (opp.expectedProfitAtomic > 0n) {
      this.grossExpectedProfitAtomic += opp.expectedProfitAtomic;
    }
  }

  recordSimulation(ok: boolean): void {
    if (ok) {
      this.simulationsPassed += 1;
      return;
    }

    this.simulationsFailed += 1;
  }

  recordExecution(ok: boolean): void {
    if (ok) {
      this.executionsSucceeded += 1;
      return;
    }

    this.executionsFailed += 1;
  }

  recordCycleLatency(ms: number): void {
    this.cycles += 1;
    this.totalCycleLatencyMs += Math.max(0, ms);
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAt: this.startedAt,
      cycles: this.cycles,
      opportunitiesDetected: this.opportunitiesDetected,
      simulationsPassed: this.simulationsPassed,
      simulationsFailed: this.simulationsFailed,
      executionsSucceeded: this.executionsSucceeded,
      executionsFailed: this.executionsFailed,
      grossExpectedProfitAtomic: this.grossExpectedProfitAtomic.toString(),
      avgCycleLatencyMs: this.cycles > 0 ? this.totalCycleLatencyMs / this.cycles : 0,
    };
  }

  async flush(worker: string): Promise<void> {
    if (!this.metricsFilePath) {
      return;
    }

    const record = {
      worker,
      ts: new Date().toISOString(),
      ...this.snapshot(),
    };

    await appendFile(this.metricsFilePath, `${JSON.stringify(record)}\n`);
  }

  recordCycle(outcome: CycleOutcome): void {
    this.recordCycleLatency(outcome.cycleLatencyMs);
    this.recordDetection(outcome.detectedCount);
    this.recordOpportunity(outcome.bestOpportunity);

    if (outcome.simulated) {
      this.recordSimulation(outcome.simulated.ok);
    }

    if (outcome.executedSignature) {
      this.recordExecution(true);
    }
  }
}
