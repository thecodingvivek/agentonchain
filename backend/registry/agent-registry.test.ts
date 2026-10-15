import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { Interface } from "ethers";
import { parseOffset, readRegistryPage, registryAbi } from "./agent-registry";

const address = "0x1111111111111111111111111111111111111111";
const abi = new Interface(registryAbi);

async function withRpc(
  scenario: { count?: number; chain?: string; code?: string; incompatible?: boolean },
  run: (env: NodeJS.ProcessEnv) => Promise<void>,
) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(chunks).toString());
    let result: unknown;
    let error: unknown;
    switch (input.method) {
      case "eth_chainId": result = scenario.chain ?? "0x14a34"; break;
      case "eth_blockNumber": result = "0x100"; break;
      case "eth_getCode": result = scenario.code ?? "0x6000"; break;
      case "eth_call": {
        if (scenario.incompatible) { error = { code: -32000, message: "execution reverted" }; break; }
        assert.equal(input.params[1], "0x100", "reads must use one consistent block snapshot");
        const call = abi.parseTransaction({ data: input.params[0].data })!;
        const total = scenario.count ?? 27;
        if (call.name === "getAgentCount") result = abi.encodeFunctionResult(call.name, [total]);
        else {
          const offset = Number(call.args[0]);
          const limit = Number(call.args[1]);
          const agents = Array.from({ length: Math.min(limit, total - offset) }, (_, index) => [
            `Agent ${offset + index}`, address, address, "Description", "https://example.com/mcp", (offset + index) % 2 === 0,
          ]);
          result = abi.encodeFunctionResult(call.name, [agents]);
        }
        break;
      }
      default: error = { code: -32601, message: "Unknown RPC method" };
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, ...(error ? { error } : { result }) }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  try { await run({ CONTRACT_ADDRESS: address, BASE_SEPOLIA_RPC_URL: `http://127.0.0.1:${port}` }); }
  finally { server.closeAllConnections(); server.close(); }
}

test("ethers ABI decoding preserves directory fields, stable IDs, status, and pagination", async () => {
  await withRpc({}, async (env) => {
    const first = await readRegistryPage(0n, env);
    assert.equal(first.total, "27");
    assert.equal(first.agents.length, 24);
    assert.equal(first.nextOffset, "24");
    assert.deepEqual(first.agents[1], { id: "1", name: "Agent 1", description: "Description", wallet: address, owner: address, endpointUrl: "https://example.com/mcp", active: false });
    const last = await readRegistryPage(24n, env);
    assert.equal(last.agents.length, 3);
    assert.equal(last.agents[0].id, "24");
    assert.equal(last.nextOffset, null);
    assert.doesNotThrow(() => JSON.stringify(last));
  });
});

test("empty registries and past-the-end pages return an empty page", async () => {
  await withRpc({ count: 0 }, async (env) => {
    assert.deepEqual((await readRegistryPage(0n, env)).agents, []);
  });
  await withRpc({ count: 1 }, async (env) => {
    const result = await readRegistryPage(24n, env);
    assert.deepEqual(result.agents, []);
    assert.equal(result.nextOffset, null);
  });
});

test("wrong network, missing bytecode, and incompatible ABI produce actionable failures", async () => {
  await withRpc({ chain: "0x1" }, async (env) => {
    await assert.rejects(readRegistryPage(0n, env), /chain 84532/);
  });
  await withRpc({ code: "0x" }, async (env) => {
    await assert.rejects(readRegistryPage(0n, env), /No contract was found/);
  });
  await withRpc({ incompatible: true }, async (env) => {
    await assert.rejects(readRegistryPage(0n, env), /matches solidity\/AgentRegistry.sol/);
  });
});

test("configuration and offsets reject invalid input before connecting", async () => {
  await assert.rejects(readRegistryPage(0n, {}), /Set CONTRACT_ADDRESS/);
  await assert.rejects(readRegistryPage(0n, { CONTRACT_ADDRESS: address, BASE_SEPOLIA_RPC_URL: "file:///tmp/rpc" }), /HTTP or HTTPS/);
  assert.equal(parseOffset(null), 0n);
  assert.equal(parseOffset("24"), 24n);
  for (const value of ["-1", "1.5", "00", "1e3", "abc"]) assert.throws(() => parseOffset(value), /Invalid registry page/);
});
