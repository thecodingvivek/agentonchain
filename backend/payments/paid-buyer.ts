import { createHash } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { createx402MCPClient, type x402MCPClient } from "@x402/mcp";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { registeredAgents } from "./agent-registry";
import { PaymentLedger } from "./payment-ledger";

export const BASE_SEPOLIA = "eip155:84532";
export const USDC_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export type BuyerWallet = { address: string; chainId: 84532; network: "base-sepolia"; maxPerCallUsdc: string };

export function usdcUnits(value: string): bigint {
  if (!/^\d{1,6}(\.\d{1,6})?$/.test(value)) throw new Error("Invalid USDC limit.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount <= 0n) throw new Error("USDC limit must be positive.");
  return amount;
}

export function parseBuyerWallet(value: unknown): BuyerWallet {
  if (!value || typeof value !== "object") throw new Error("Save your payment wallet in Cards before using a paid agent.");
  const wallet = value as BuyerWallet;
  if (typeof wallet.address !== "string" || !/^0x[\da-fA-F]{40}$/.test(wallet.address) || /^0x0{40}$/i.test(wallet.address) ||
      wallet.chainId !== 84532 || wallet.network !== "base-sepolia" || typeof wallet.maxPerCallUsdc !== "string") throw new Error("Invalid Base Sepolia payment card.");
  usdcUnits(wallet.maxPerCallUsdc);
  return { address: wallet.address, chainId: 84532, network: "base-sepolia", maxPerCallUsdc: wallet.maxPerCallUsdc };
}

export function buyerAccount(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ACC_PRIVATE_KEY?.trim();
  if (!value || !/^(0x)?[\da-fA-F]{64}$/.test(value)) throw new Error("ACC_PRIVATE_KEY is missing or invalid on the backend.");
  try { return privateKeyToAccount((value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`); }
  catch { throw new Error("ACC_PRIVATE_KEY is invalid on the backend."); }
}

export function buyerStatus(env: NodeJS.ProcessEnv = process.env) {
  try {
    const account = buyerAccount(env);
    const maxPerCallUsdc = env.X402_MAX_PER_CALL_USDC || "0.01";
    usdcUnits(maxPerCallUsdc);
    return { configured: true, address: account.address, chainId: 84532, network: "base-sepolia", maxPerCallUsdc };
  } catch { return { configured: false, address: null, chainId: 84532, network: "base-sepolia", maxPerCallUsdc: "0.01" }; }
}

function seller(agentId: string) {
  const agent = registeredAgents.find((entry) => entry.id === agentId);
  if (!agent?.payment || agent.transport !== "MCP") throw new Error("Choose Agentonchain assistant or Everyday helper from the registered agents.");
  return agent;
}

export function validateChallenge(required: PaymentRequired, recipient: string, limit: bigint): PaymentRequirements {
  if (required.x402Version !== 2 || required.accepts.length !== 1 || required.resource?.url !== "mcp://tool/ask_agent" ||
      required.extensions && Object.keys(required.extensions).length > 0) throw new Error("Unexpected seller payment request.");
  const payment = required.accepts[0];
  if (payment.network !== BASE_SEPOLIA || payment.scheme !== "exact" || payment.asset.toLowerCase() !== USDC_ASSET.toLowerCase() ||
      payment.payTo.toLowerCase() !== recipient.toLowerCase() || payment.amount !== "10000" || BigInt(payment.amount) > limit ||
      payment.extra?.name !== "USDC" || payment.extra?.version !== "2" || payment.extra?.assetTransferMethod && payment.extra.assetTransferMethod !== "eip3009" ||
      payment.extra?.paymentFlow && payment.extra.paymentFlow !== "authorization" || !Number.isInteger(payment.maxTimeoutSeconds) ||
      payment.maxTimeoutSeconds < 1 || payment.maxTimeoutSeconds > 120) throw new Error("Seller price, recipient, asset, network, or payment scheme violates the payment policy.");
  return payment;
}

type InvokeInput = { agentId: string; query: string; wallet: unknown; sessionId: string; turnId: string; signal?: AbortSignal };
type BuyerDependencies = {
  env?: NodeJS.ProcessEnv;
  ledger?: PaymentLedger;
  connect?: (client: x402MCPClient, endpoint: string, signal: AbortSignal) => Promise<void>;
};

export async function invokePaidAgent(input: InvokeInput, dependencies: BuyerDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const agent = seller(input.agentId);
  if (!input.query.trim() || input.query.length > 8000) throw new Error("Enter a query of up to 8,000 characters.");
  const wallet = parseBuyerWallet(input.wallet);
  const account = buyerAccount(env);
  if (wallet.address.toLowerCase() !== account.address.toLowerCase()) throw new Error("The payment card address must match the backend ACC_PRIVATE_KEY wallet.");
  const recipient = env.X402_RECIPIENT?.trim();
  if (!recipient || !/^0x[\da-fA-F]{40}$/.test(recipient) || /^0x0{40}$/i.test(recipient)) throw new Error("Set X402_RECIPIENT on the backend before using a paid agent.");
  const limits = [usdcUnits(wallet.maxPerCallUsdc), usdcUnits(env.X402_MAX_PER_CALL_USDC || "0.01")];
  const limit = limits[0] < limits[1] ? limits[0] : limits[1];
  if (limit < 10000n) throw new Error("The 0.01 USDC agent price exceeds your spending limit.");
  const signal = AbortSignal.any([input.signal ?? new AbortController().signal, AbortSignal.timeout(120_000)]);
  signal.throwIfAborted();
  const intent = createHash("sha256").update(JSON.stringify([agent.id, input.query, account.address, recipient])).digest("hex");
  const reservation = (dependencies.ledger ?? new PaymentLedger()).reserve(input.sessionId, input.turnId, intent);
  if ("cached" in reservation) return reservation.cached;
  let signingStarted = false;
  let expected: PaymentRequirements | undefined;
  const client = createx402MCPClient({
    name: "Agentonchain chat buyer", version: "1.0.0",
    schemes: [{ network: BASE_SEPOLIA, client: new ExactEvmScheme(account) }],
    autoPayment: true,
    policies: [(_version, requirements) => requirements.filter((entry) => expected && JSON.stringify(entry) === JSON.stringify(expected))],
    onPaymentRequested({ paymentRequired }) {
      expected = validateChallenge(paymentRequired, recipient, limit);
      return true;
    },
  });
  client.onBeforePayment(() => {
    signal.throwIfAborted();
    reservation.markSigning();
    signingStarted = true;
  });
  try {
    if (dependencies.connect) await dependencies.connect(client, agent.endpointUrl, signal);
    else await client.connect(new StreamableHTTPClientTransport(new URL(agent.endpointUrl), {
      requestInit: { signal, redirect: "error" },
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    }));
    const result = await client.callTool("ask_agent", { query: input.query.trim() }, { signal, timeout: 120_000 });
    if (result.isError || !result.paymentMade || !result.paymentResponse?.success || result.paymentResponse.network !== BASE_SEPOLIA ||
        !/^0x[\da-fA-F]{64}$/.test(result.paymentResponse.transaction)) throw new Error("No confirmed paid result was returned.");
    const answer = result.content.filter((item) => item.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n\n");
    if (!answer.trim()) throw new Error("The seller returned an empty answer.");
    const output = { agentId: agent.id, agent: agent.name, answer, payment: { amountUsdc: "0.01", network: "base-sepolia", transaction: result.paymentResponse.transaction, payer: account.address, recipient } };
    reservation.complete(output);
    return output;
  } catch {
    reservation.fail();
    throw new Error(signingStarted ? "The paid request did not return a confirmed result. Payment may have been submitted; check the wallet before trying again. No automatic retry was made." : "Could not invoke the paid agent. Check that the seller is running and its payment request matches the configured price, recipient, and network.");
  } finally { await client.close().catch(() => {}); }
}
