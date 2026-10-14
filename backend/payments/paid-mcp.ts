import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaymentWrapper } from "@x402/mcp";
import type { PaymentRequirements } from "@x402/core/types";
import { defineChannel, POST, GET, DELETE, type ChannelFrom } from "eve/channels";
import { z } from "zod";

export const PAYMENT_NETWORK = "eip155:84532";
export const PAYMENT_PRICE = "$0.01";

export function paymentConfig(env: NodeJS.ProcessEnv = process.env) {
  const recipient = env.X402_RECIPIENT?.trim();
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient) || /^0x0{40}$/i.test(recipient)) {
    throw new Error("Set X402_RECIPIENT to a nonzero Ethereum wallet address in backend/.env.local.");
  }
  const facilitatorUrl = env.X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator";
  const url = new URL(facilitatorUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("X402_FACILITATOR_URL must be an HTTPS URL without credentials.");
  return { recipient, facilitatorUrl };
}

type PaymentService = { resourceServer: x402ResourceServer; accepts: PaymentRequirements[] };
let paymentService: Promise<PaymentService> | undefined;

async function getPaymentService(): Promise<PaymentService> {
  if (!paymentService) {
    paymentService = (async () => {
      const config = paymentConfig();
      const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient({ url: config.facilitatorUrl, timeoutMs: 10_000 }));
      resourceServer.register(PAYMENT_NETWORK, new ExactEvmScheme());
      await resourceServer.initialize();
      const accepts = await resourceServer.buildPaymentRequirements({
        scheme: "exact", network: PAYMENT_NETWORK, payTo: config.recipient,
        price: PAYMENT_PRICE, maxTimeoutSeconds: 120,
      });
      return { resourceServer, accepts };
    })();
    // Configuration or facilitator failures never enable a free fallback.
    paymentService.catch(() => { paymentService = undefined; });
  }
  return paymentService;
}

type QueryHandler = (query: string, signal: AbortSignal) => Promise<string>;

/** MCP seller wrapper; the query handler remains eve's real agent runtime. */
export function createPaidMcpServer(name: string, answer: QueryHandler, payments: () => Promise<PaymentService> = getPaymentService) {
  const server = new McpServer({ name, version: "1.0.0" });
  server.registerTool("ask_agent", {
    description: `Ask ${name} a question. Costs 0.01 USDC per call on Base Sepolia (testnet).`,
    inputSchema: { query: z.string().trim().min(1).max(8000) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (args, extra) => {
    try {
      const { resourceServer, accepts } = await payments();
      const paid = createPaymentWrapper(resourceServer, {
        accepts,
        resource: { url: "mcp://tool/ask_agent", description: `A response from ${name}`, mimeType: "text/plain" },
      });
      return await paid(async ({ query }: { query: string }) => {
        try {
          const text = await answer(query, extra.signal);
          return { content: [{ type: "text" as const, text }] };
        } catch {
          // isError prevents settlement for a failed agent execution.
          return { isError: true, content: [{ type: "text" as const, text: "The agent could not answer. No successful result was produced; payment was not settled." }] };
        }
      })(args, extra);
    } catch {
      return { isError: true, content: [{ type: "text" as const, text: "Paid tool unavailable. Check X402_RECIPIENT and facilitator configuration on the server." }] };
    }
  });
  server.registerTool("ping", {
    description: "Free MCP server health check.",
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => ({ content: [{ type: "text", text: "pong" }] }));
  return server;
}

async function answerWithEve(from: ChannelFrom, query: string, requestSignal: AbortSignal): Promise<string> {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(90_000)]);
  signal.throwIfAborted();
  const session = await from(randomUUID()).send(query, { auth: null, mode: "task" });
  const reader = (await session.getEventStream()).getReader();
  const messages: string[] = [];
  const onAbort = () => { void reader.cancel(); void session.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value: event, done } = await reader.read();
      signal.throwIfAborted();
      if (done) throw new Error("Agent stream ended before completion.");
      if (event.type === "message.completed" && event.data.message) messages.push(event.data.message);
      if (event.type === "turn.completed") {
        const answer = messages.join("\n\n");
        if (!answer.trim()) throw new Error("Empty agent result.");
        return answer;
      }
      if (["step.failed", "turn.failed", "session.failed", "turn.cancelled", "input.requested"].includes(event.type)) throw new Error("Agent execution failed.");
    }
  } catch (error) {
    await session.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function paidMcpChannel(name: string) {
  return defineChannel({
    routes: [
      POST("/mcp", async (request, { from }) => {
        const url = new URL(request.url);
        const origin = request.headers.get("origin");
        if (origin && origin !== url.origin) return new Response("Origin not allowed", { status: 403 });
        if (request.headers.get("host") && request.headers.get("host") !== url.host) return new Response("Host not allowed", { status: 403 });
        const server = createPaidMcpServer(name, (query, signal) => answerWithEve(from, query, signal));
        const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true, maxRequestBodySize: 1_048_576 });
        try {
          await server.connect(transport);
          return await transport.handleRequest(request);
        } finally {
          await server.close();
        }
      }),
      GET("/mcp", async () => new Response("Use POST for stateless MCP requests.", { status: 405, headers: { Allow: "POST" } })),
      DELETE("/mcp", async () => new Response(null, { status: 405, headers: { Allow: "POST" } })),
    ],
  });
}
