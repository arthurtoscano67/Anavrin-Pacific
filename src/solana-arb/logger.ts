import { appendFile } from "node:fs/promises";

export interface LogRecord {
  level: "debug" | "info" | "warn" | "error";
  msg: string;
  worker?: string;
  ts: string;
  [key: string]: unknown;
}

export class Logger {
  constructor(private readonly worker: string, private readonly logFilePath?: string) {}

  debug(msg: string, fields: Record<string, unknown> = {}): void {
    this.write("debug", msg, fields);
  }

  info(msg: string, fields: Record<string, unknown> = {}): void {
    this.write("info", msg, fields);
  }

  warn(msg: string, fields: Record<string, unknown> = {}): void {
    this.write("warn", msg, fields);
  }

  error(msg: string, fields: Record<string, unknown> = {}): void {
    this.write("error", msg, fields);
  }

  private write(level: LogRecord["level"], msg: string, fields: Record<string, unknown>): void {
    const record: LogRecord = {
      level,
      msg,
      worker: this.worker,
      ts: new Date().toISOString(),
      ...fields,
    };

    const line = JSON.stringify(record);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }

    if (this.logFilePath) {
      void appendFile(this.logFilePath, `${line}\n`).catch(() => {
        // Keep bot loop resilient even if disk writes fail.
      });
    }
  }
}
