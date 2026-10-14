import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type RecordState = { intent: string; state: "reserved" | "signing" | "completed" | "failed"; result?: unknown };

/** Single-host durable guard: at most one paid invocation per chat turn. */
export class PaymentLedger {
  constructor(private directory = resolve(process.cwd(), ".eve", "paid-calls")) {}

  reserve(sessionId: string, turnId: string, intent: string) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const key = createHash("sha256").update(`${sessionId}\0${turnId}`).digest("hex");
    const directory = join(this.directory, key);
    const file = join(directory, "record.json");
    const write = (record: RecordState) => {
      const temporary = join(directory, `${randomUUID()}.tmp`);
      writeFileSync(temporary, JSON.stringify(record), { mode: 0o600 });
      renameSync(temporary, file);
    };
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let record: RecordState;
      try { record = JSON.parse(readFileSync(file, "utf8")); } catch { throw new Error("A payment attempt already exists for this turn. Do not retry automatically."); }
      if (record.intent === intent && record.state === "completed") return { cached: record.result };
      throw new Error("Only one paid agent call is allowed per chat turn. A prior attempt exists; do not repeat it automatically.");
    }
    write({ intent, state: "reserved" });
    return {
      markSigning: () => write({ intent, state: "signing" }),
      complete: (result: unknown) => write({ intent, state: "completed", result }),
      fail: () => write({ intent, state: "failed" }),
    };
  }
}
