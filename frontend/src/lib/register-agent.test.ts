import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Eip1193Provider } from "ethers";
import { checkRegistration, registrationAbi, submitRegistration, validateRegistration } from "./register-agent";

const target = `0x${"1".repeat(40)}`;
const owner = `0x${"2".repeat(40)}`;
const paymentWallet = `0x${"3".repeat(40)}`;
const hash = `0x${"4".repeat(64)}`;
const input = { name: "Everyday helper", wallet: paymentWallet, description: "Practical everyday help", endpointUrl: "http://127.0.0.1:2001/mcp" };

test("registration validates contract byte limits, wallets, and endpoint protocols before wallet requests", () => {
  assert.equal(validateRegistration({ ...input, name: "  Everyday helper  " }).name, input.name);
  assert.throws(() => validateRegistration({ ...input, wallet: `0x${"0".repeat(40)}` }), /nonzero/);
  assert.throws(() => validateRegistration({ ...input, name: "🤖".repeat(33) }), /128 bytes/);
  assert.throws(() => validateRegistration({ ...input, description: "x".repeat(2049) }), /2,048 bytes/);
  assert.throws(() => validateRegistration({ ...input, endpointUrl: "javascript:alert(1)" }), /HTTP or HTTPS/);
  assert.throws(() => validateRegistration({ ...input, endpointUrl: "https://user:password@example.com" }), /without credentials/);
});

test("browser-wallet transaction encodes the deployed ABI and sends zero ETH to the configured registry", async () => {
  for (const details of [true, false]) {
    const methods: string[] = [];
    let chain = "0x1";
    const wallet: Eip1193Provider = { async request({ method, params }) {
      methods.push(method);
      if (method === "eth_chainId") return chain;
      if (method === "wallet_switchEthereumChain") { chain = "0x14a34"; return null; }
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [owner];
      if (method === "eth_getCode") return "0x6000";
      if (method === "eth_sendTransaction") {
        const tx = (params as { from: string; to: string; value: string; data: string; chainId: string }[])[0];
        assert.equal(tx.to, target);
        assert.equal(tx.from, owner);
        assert.equal(tx.value, "0x0");
        assert.equal(tx.chainId, "0x14a34");
        const decoded = registrationAbi.parseTransaction({ data: tx.data })!;
        assert.equal(decoded.name, details ? "addAgentWithDetails" : "addAgent");
        assert.equal(decoded.args[0], input.name);
        assert.equal(decoded.args[1], paymentWallet);
        if (details) assert.equal(decoded.args[3], input.endpointUrl);
        return hash;
      }
      throw new Error(`Unexpected wallet call: ${method}`);
    } };
    const data = details ? input : { ...input, description: "", endpointUrl: "" };
    assert.equal(await submitRegistration(wallet, target, data), hash);
    assert.equal(methods.filter((method) => method === "eth_sendTransaction").length, 1);
    assert.ok(methods.includes("wallet_switchEthereumChain"));
    assert.ok(methods.indexOf("eth_requestAccounts") < methods.indexOf("wallet_switchEthereumChain"), "connect before requesting a network switch");
    assert.ok(methods.indexOf("wallet_switchEthereumChain") < methods.indexOf("eth_accounts"), "re-read the sender after switching");
  }
});

test("wrong chain and rejected wallet connection never send a registration transaction", async () => {
  let sent = false;
  const wallet: Eip1193Provider = { async request({ method }) {
    if (method === "eth_chainId") return "0x1";
    if (method === "wallet_switchEthereumChain") return null;
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [owner];
    sent = true;
    throw new Error("Transaction must not be sent");
  } };
  await assert.rejects(submitRegistration(wallet, target, input), /Select Base Sepolia/);
  assert.equal(sent, false);
  const rejected: Eip1193Provider = { async request({ method }) {
    if (method === "eth_chainId") return "0x14a34";
    throw Object.assign(new Error("User rejected"), { code: 4001 });
  } };
  await assert.rejects(submitRegistration(rejected, target, input), /User rejected/);
});

test("confirmation requires a successful receipt with AgentAdded from this registry", async () => {
  const event = registrationAbi.encodeEventLog(registrationAbi.getEvent("AgentAdded")!, [7, input.name, paymentWallet]);
  const receipt = {
    transactionHash: hash, transactionIndex: "0x0", blockHash: `0x${"5".repeat(64)}`, blockNumber: "0x100",
    from: owner, to: target, cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x1",
    logsBloom: `0x${"0".repeat(512)}`, status: "0x1", type: "0x2", contractAddress: null,
    logs: [{ address: target, data: event.data, topics: event.topics, blockHash: `0x${"5".repeat(64)}`,
      blockNumber: "0x100", transactionHash: hash, transactionIndex: "0x0", logIndex: "0x0", removed: false }],
  };
  let current: unknown = null;
  const wallet: Eip1193Provider = { async request({ method }) {
    if (method === "eth_chainId") return "0x14a34";
    if (method === "eth_getTransactionReceipt") return current;
    throw new Error(`Unexpected wallet call: ${method}`);
  } };
  assert.deepEqual(await checkRegistration(wallet, target, hash), { status: "pending" });
  current = receipt;
  assert.deepEqual(await checkRegistration(wallet, target, hash), { status: "confirmed", agentId: "7" });
  current = { ...receipt, status: "0x0", logs: [] };
  assert.deepEqual(await checkRegistration(wallet, target, hash), { status: "reverted" });
  current = { ...receipt, logs: [{ ...receipt.logs[0], address: paymentWallet }] };
  await assert.rejects(checkRegistration(wallet, target, hash), /no AgentAdded event/);
});
