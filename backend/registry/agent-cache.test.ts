import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listCachedAgents, readAgentCache, refreshAgentCache } from "./agent-cache";
import type { RegistrySnapshot } from "./agent-registry";

const address = "0x1111111111111111111111111111111111111111";
function fixture(names: string[]): RegistrySnapshot {
  return {
    contractAddress: address, chainId: 84532, blockNumber: 100,
    total: String(names.length), updatedAt: "2026-10-16T00:00:00.000Z",
    agents: names.map((name, index) => ({
      id: String(index), name, description: `${name} description`, wallet: address,
      owner: address, endpointUrl: `https://example.com/${index}/mcp`, active: index !== 1,
    })),
  };
}

async function withCache(run: (env: NodeJS.ProcessEnv, file: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "agent-registry-cache-"));
  const file = join(directory, "agents.json");
  try { await run({ CONTRACT_ADDRESS: address, AGENT_REGISTRY_CACHE_FILE: file }, file); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("saved full directory and tool use the same data; tool rereads updates and filters inactive entries", async () => {
  await withCache(async (env, file) => {
    const snapshot = fixture(Array.from({ length: 27 }, (_, i) => `Agent ${i}`));
    await refreshAgentCache(env, async () => snapshot);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), snapshot);
    const listed = await listCachedAgents(env);
    assert.equal(listed.total, 26);
    assert.equal(listed.agents.at(-1)?.id, "26", "tool includes entries beyond the first UI page");
    assert.ok(!listed.agents.some((agent) => agent.id === "1"));
    const changed = fixture(["Updated agent"]);
    await refreshAgentCache(env, async () => changed);
    assert.deepEqual((await listCachedAgents(env)).agents, changed.agents);
    await refreshAgentCache(env, async () => fixture([]));
    assert.deepEqual((await listCachedAgents(env)).agents, [], "empty refresh replaces old entries");
  });
});

test("failed and incomplete refreshes preserve the previous saved directory", async () => {
  await withCache(async (env, file) => {
    await refreshAgentCache(env, async () => fixture(["Original"]));
    const previous = await readFile(file, "utf8");
    await assert.rejects(refreshAgentCache(env, async () => { throw new Error("RPC failed mid-fetch"); }));
    await assert.rejects(refreshAgentCache(env, async () => ({ ...fixture(["Partial"]), total: "27" })));
    assert.equal(await readFile(file, "utf8"), previous);
    assert.equal((await listCachedAgents(env)).agents[0].name, "Original");
  });
});

test("missing, corrupt, and different-contract caches report refresh instructions without static fallback", async () => {
  await withCache(async (env, file) => {
    assert.match((await listCachedAgents(env)).error ?? "", /Refresh agents/);
    await writeFile(file, "broken JSON");
    await assert.rejects(readAgentCache(env));
    await refreshAgentCache(env, async () => fixture(["Saved"]));
    const result = await listCachedAgents({ ...env, CONTRACT_ADDRESS: `0x${"2".repeat(40)}` });
    assert.deepEqual(result.agents, []);
    assert.match(result.error ?? "", /Refresh agents/);
  });
});

test("concurrent refreshes share a complete snapshot and leave valid JSON", async () => {
  await withCache(async (env) => {
    let calls = 0;
    const fetch = async () => { calls++; return fixture(["Concurrent"]); };
    const [first, second] = await Promise.all([refreshAgentCache(env, fetch), refreshAgentCache(env, fetch)]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
    assert.deepEqual(await readAgentCache(env), first);
  });
});
