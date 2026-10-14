import { defineTool } from "eve/tools";
import { z } from "zod";
import { invokePaidAgent } from "../../../payments/paid-buyer";

export default defineTool({
  description: "Use a user-selected registered seller agent to answer a query. Pays exactly 0.01 test USDC using the backend buyer wallet and returns the answer and receipt. Call only when the user explicitly asks to use that agent. One paid invocation is allowed per chat turn.",
  inputSchema: z.object({
    agentId: z.enum(["agentonchain-assistant", "everyday-helper"]),
    query: z.string().trim().min(1).max(8000),
  }),
  async execute(input, ctx) {
    const serialized = ctx.session.auth.current?.attributes.paymentWallet;
    let wallet: unknown;
    try { wallet = typeof serialized === "string" ? JSON.parse(serialized) : null; } catch { wallet = null; }
    try {
      return await invokePaidAgent({ ...input, wallet, sessionId: ctx.session.id, turnId: ctx.session.turn.id, signal: ctx.abortSignal });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The paid invocation failed.", paidResultConfirmed: false };
    }
  },
});
