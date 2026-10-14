import { strict as assert } from "node:assert";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createPaidMcpServer, paymentConfig, PAYMENT_NETWORK, PAYMENT_PRICE } from "./paid-mcp";

// Facilitator responses are mocked; these tests never send on-chain payments.
async function fixture(options: { valid?: boolean; settles?: boolean; fails?: boolean } = {}) {
  const counts = { verifies: 0, executes: 0, settles: 0 };
  const facilitator: FacilitatorClient = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: PAYMENT_NETWORK }], extensions: [], signers: {} }; },
    async verify() { counts.verifies++; return { isValid: options.valid !== false, invalidReason: options.valid === false ? "invalid_signature" : undefined }; },
    async settle() { counts.settles++; return { success: options.settles !== false, transaction: options.settles === false ? "" : "0xtest-receipt", network: PAYMENT_NETWORK, errorReason: options.settles === false ? "settlement_failed" : undefined }; },
  };
  const resourceServer = new x402ResourceServer(facilitator).register(PAYMENT_NETWORK, new ExactEvmScheme());
  await resourceServer.initialize();
  const accepts = await resourceServer.buildPaymentRequirements({ scheme: "exact", network: PAYMENT_NETWORK, payTo: "0x1111111111111111111111111111111111111111", price: PAYMENT_PRICE, maxTimeoutSeconds: 120 });
  const server = createPaidMcpServer("Test seller", async (query) => {
    counts.executes++;
    if (options.fails) throw new Error("Agent failed");
    return `Answer: ${query}`;
  }, async () => ({ resourceServer, accepts }));
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "seller-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const payment = { x402Version: 2, accepted: accepts[0], payload: {} };
  return { client, counts, payment, async close() { await client.close(); await server.close(); } };
}

test("seller config fails closed for missing/placeholder/zero wallets and non-HTTPS facilitators", () => {
  for (const recipient of [undefined, "0xYourWalletAddress", `0x${"0".repeat(40)}`]) assert.throws(() => paymentConfig({ X402_RECIPIENT: recipient }));
  assert.throws(() => paymentConfig({ X402_RECIPIENT: "0x1111111111111111111111111111111111111111", X402_FACILITATOR_URL: "http://untrusted.test" }));
});

test("MCP discovers paid ask_agent and free ping; unpaid calls advertise exactly 0.01 Base Sepolia USDC without running eve", async () => {
  const f = await fixture();
  try {
    assert.deepEqual((await f.client.listTools()).tools.map((tool) => tool.name), ["ask_agent", "ping"]);
    const ping = await f.client.callTool({ name: "ping", arguments: {} });
    assert.deepEqual(ping.content, [{ type: "text", text: "pong" }]);
    const result = await f.client.callTool({ name: "ask_agent", arguments: { query: "Hello" } });
    assert.equal(result.isError, true);
    const required = result.structuredContent as { x402Version: number; accepts: { amount: string; network: string; asset: string }[] };
    assert.equal(required.x402Version, 2);
    assert.equal(required.accepts[0].amount, "10000");
    assert.equal(required.accepts[0].network, PAYMENT_NETWORK);
    assert.equal(required.accepts[0].asset.toLowerCase(), "0x036cbd53842c5426634e7929541ec2318f3dcf7e");
    assert.deepEqual(f.counts, { verifies: 0, executes: 0, settles: 0 });
  } finally { await f.close(); }
});

test("invalid proof and mismatched price never execute the agent or settle", async () => {
  const f = await fixture({ valid: false });
  try {
    assert.equal((await f.client.callTool({ name: "ask_agent", arguments: { query: "Hello" }, _meta: { "x402/payment": f.payment } })).isError, true);
    const wrongPrice = { ...f.payment, accepted: { ...f.payment.accepted, amount: "1" } };
    assert.equal((await f.client.callTool({ name: "ask_agent", arguments: { query: "Hello" }, _meta: { "x402/payment": wrongPrice } })).isError, true);
    assert.deepEqual(f.counts, { verifies: 1, executes: 0, settles: 0 });
  } finally { await f.close(); }
});

test("verified mock payment executes the query and includes the settlement receipt", async () => {
  const f = await fixture();
  try {
    const result = await f.client.callTool({ name: "ask_agent", arguments: { query: "Hello" }, _meta: { "x402/payment": f.payment } });
    assert.notEqual(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "Answer: Hello" }]);
    assert.equal((result._meta?.["x402/payment-response"] as { success: boolean }).success, true);
    assert.deepEqual(f.counts, { verifies: 1, executes: 1, settles: 1 });
  } finally { await f.close(); }
});

test("agent failures are not charged; settlement failures do not release the answer", async () => {
  for (const options of [{ fails: true }, { settles: false }]) {
    const f = await fixture(options);
    try {
      const result = await f.client.callTool({ name: "ask_agent", arguments: { query: "Hello" }, _meta: { "x402/payment": f.payment } });
      assert.equal(result.isError, true);
      assert.ok(!JSON.stringify(result.content).includes("Answer: Hello"));
      assert.equal(f.counts.executes, 1);
      assert.equal(f.counts.settles, options.fails ? 0 : 1);
    } finally { await f.close(); }
  }
});
