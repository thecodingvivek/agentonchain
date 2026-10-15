import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import type { x402MCPClient } from "@x402/mcp";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { recoverTypedDataAddress } from "viem";
import { createPaidMcpServer } from "./paid-mcp";
import { BASE_SEPOLIA, USDC_ASSET, buyerAccount, invokePaidAgent, usdcUnits, validateChallenge } from "./paid-buyer";
import { PaymentLedger } from "./payment-ledger";

// Synthetic signing key and in-memory facilitator: no RPC or real payment occurs.
const testEnv = { ACC_PRIVATE_KEY: `0x${"1".repeat(64)}`, X402_RECIPIENT: `0x${"2".repeat(40)}`, X402_MAX_PER_CALL_USDC: "0.01" };
const account = buyerAccount(testEnv);
const wallet = { address: account.address, chainId: 84532, network: "base-sepolia", maxPerCallUsdc: "0.01" };

async function fixture(options: { wrongRecipient?: boolean; overcharge?: boolean; failedSettlement?: boolean } = {}) {
  const counts = { verifies: 0, executes: 0, settles: 0 };
  const facilitator: FacilitatorClient = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: "exact", network: BASE_SEPOLIA }], extensions: [], signers: {} }; },
    async verify(payload) {
      counts.verifies++;
      const data = payload.payload as { signature: `0x${string}`; authorization: { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } };
      const recovered = await recoverTypedDataAddress({
        domain: { name: "USDC", version: "2", chainId: 84532, verifyingContract: USDC_ASSET },
        types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
        primaryType: "TransferWithAuthorization", message: { ...data.authorization, value: BigInt(data.authorization.value), validAfter: BigInt(data.authorization.validAfter), validBefore: BigInt(data.authorization.validBefore) }, signature: data.signature,
      });
      return { isValid: recovered.toLowerCase() === account.address.toLowerCase(), payer: recovered };
    },
    async settle() { counts.settles++; return { success: !options.failedSettlement, network: BASE_SEPOLIA, transaction: options.failedSettlement ? "" : `0x${"ab".repeat(32)}`, errorReason: options.failedSettlement ? "test_failure" : undefined }; },
  };
  const resourceServer = new x402ResourceServer(facilitator).register(BASE_SEPOLIA, new ExactEvmScheme());
  await resourceServer.initialize();
  const accepts = await resourceServer.buildPaymentRequirements({ scheme: "exact", network: BASE_SEPOLIA, payTo: options.wrongRecipient ? `0x${"3".repeat(40)}` : testEnv.X402_RECIPIENT, price: options.overcharge ? "$0.02" : "$0.01", maxTimeoutSeconds: 120 });
  const directory = mkdtempSync(join(tmpdir(), "agentonchain-buyer-"));
  const ledger = new PaymentLedger(directory);
  const servers: ReturnType<typeof createPaidMcpServer>[] = [];
  const dependencies = {
    env: testEnv, ledger,
    async connect(client: x402MCPClient) {
      const server = createPaidMcpServer("Mock paid eve seller", async (query) => { counts.executes++; return `Seller answer: ${query}`; }, async () => ({ resourceServer, accepts }));
      servers.push(server);
      const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      await client.connect(clientTransport);
    },
  };
  return { counts, dependencies, async close() { for (const server of servers) await server.close(); rmSync(directory, { recursive: true, force: true }); } };
}

const input = { agentId: "everyday-helper", query: "Explain APIs", wallet, sessionId: "test-session", turnId: "turn-1" };

test("buyer signs a valid authorization, pays the mock seller, returns answer/receipt, and caches workflow replays", async () => {
  const f = await fixture();
  try {
    const result = await invokePaidAgent(input, f.dependencies) as { answer: string; payment: { amountUsdc: string; transaction: string } };
    assert.equal(result.answer, "Seller answer: Explain APIs");
    assert.equal(result.payment.amountUsdc, "0.01");
    assert.ok(result.payment.transaction.startsWith("0xab"));
    assert.deepEqual(await invokePaidAgent(input, f.dependencies), result);
    assert.deepEqual(f.counts, { verifies: 1, executes: 1, settles: 1 });
    await assert.rejects(invokePaidAgent({ ...input, agentId: "agentonchain-assistant" }, f.dependencies), /one paid agent call/);
  } finally { await f.close(); }
});

test("no signing for wrong recipient or seller overcharge", async () => {
  for (const options of [{ wrongRecipient: true }, { overcharge: true }]) {
    const f = await fixture(options);
    try {
      await assert.rejects(invokePaidAgent(input, f.dependencies));
      assert.deepEqual(f.counts, { verifies: 0, executes: 0, settles: 0 });
    } finally { await f.close(); }
  }
});

test("unknown agents, absent cards, signer mismatch, and low card limits fail before contacting a seller", async () => {
  const f = await fixture();
  try {
    for (const change of [{ agentId: "http://attacker.test/mcp" }, { wallet: null }, { wallet: { ...wallet, address: `0x${"4".repeat(40)}` } }, { wallet: { ...wallet, maxPerCallUsdc: "0.001" } }]) {
      await assert.rejects(invokePaidAgent({ ...input, ...change }, f.dependencies));
    }
    assert.deepEqual(f.counts, { verifies: 0, executes: 0, settles: 0 });
  } finally { await f.close(); }
});

test("failed or uncertain settlement is blocked from automatic retries", async () => {
  const f = await fixture({ failedSettlement: true });
  try {
    await assert.rejects(invokePaidAgent(input, f.dependencies), /Payment settlement failed: test_failure.*Payment may have been submitted/);
    await assert.rejects(invokePaidAgent(input, f.dependencies), /prior attempt exists/);
    assert.deepEqual(f.counts, { verifies: 1, executes: 1, settles: 1 });
  } finally { await f.close(); }
});

test("policy rejects wrong chain, token, amount, or timeout; USDC limits use exact integer arithmetic", () => {
  assert.equal(usdcUnits("0.000001"), 1n);
  assert.equal(usdcUnits("0.01"), 10000n);
  assert.throws(() => usdcUnits("0.0000001"));
  const payment: PaymentRequirements = { scheme: "exact", network: BASE_SEPOLIA, amount: "10000", asset: USDC_ASSET, payTo: testEnv.X402_RECIPIENT, maxTimeoutSeconds: 120, extra: { name: "USDC", version: "2" } };
  for (const change of [{ network: "eip155:8453" as const }, { asset: `0x${"5".repeat(40)}` }, { amount: "20000" }, { maxTimeoutSeconds: 1000 }]) {
    assert.throws(() => validateChallenge({ x402Version: 2, resource: { url: "mcp://tool/ask_agent", description: "", mimeType: "text/plain" }, accepts: [{ ...payment, ...change }] }, testEnv.X402_RECIPIENT, 10000n));
  }
});
