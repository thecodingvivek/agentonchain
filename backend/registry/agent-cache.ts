import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { readRegistrySnapshot, RegistryError, type RegistrySnapshot } from "./agent-registry";

const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const snapshotSchema = z.object({
  contractAddress: address,
  chainId: z.literal(84532),
  blockNumber: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
  total: z.string().regex(/^(0|[1-9]\d*)$/),
  agents: z.array(z.object({
    id: z.string(), name: z.string(), wallet: address, owner: address,
    description: z.string(), endpointUrl: z.string(), active: z.boolean(),
  })),
}).refine((value) => BigInt(value.total) === BigInt(value.agents.length) &&
  value.agents.every((agent, index) => agent.id === String(index)), "Incomplete registry snapshot");

/** Resolve from the backend package, independent of Eve's dev/build working directory. */
export function registryCacheFile(env: NodeJS.ProcessEnv = process.env) {
  if (env.AGENT_REGISTRY_CACHE_FILE) return resolve(env.AGENT_REGISTRY_CACHE_FILE);
  let directory = process.cwd();
  while (true) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).name === "agentonchain-assistant") {
          return join(directory, "data", "agents.json");
        }
      } catch { /* Continue past unrelated package manifests. */ }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new RegistryError("Cannot locate the backend data directory. Set AGENT_REGISTRY_CACHE_FILE to an absolute file path.", 503);
}

export async function readAgentCache(env: NodeJS.ProcessEnv = process.env): Promise<RegistrySnapshot> {
  try {
    const snapshot = snapshotSchema.parse(JSON.parse(await readFile(registryCacheFile(env), "utf8")));
    if (!env.CONTRACT_ADDRESS || snapshot.contractAddress.toLowerCase() !== env.CONTRACT_ADDRESS.trim().toLowerCase()) {
      throw new Error("Different registry contract");
    }
    return snapshot;
  } catch {
    throw new RegistryError("No valid saved agent directory for this contract. Open Deploy and click Refresh agents to update backend/data/agents.json.", 503);
  }
}

const pending = new Map<string, Promise<RegistrySnapshot>>();

/** Concurrent refreshes share one job; readers see either the previous or complete new file. */
export function refreshAgentCache(
  env: NodeJS.ProcessEnv = process.env,
  fetchSnapshot: (env: NodeJS.ProcessEnv) => Promise<RegistrySnapshot> = readRegistrySnapshot,
): Promise<RegistrySnapshot> {
  const file = registryCacheFile(env);
  const current = pending.get(file);
  if (current) return current;
  const job = (async () => {
    const snapshot = snapshotSchema.parse(await fetchSnapshot(env));
    if (!env.CONTRACT_ADDRESS || snapshot.contractAddress.toLowerCase() !== env.CONTRACT_ADDRESS.trim().toLowerCase()) {
      throw new RegistryError("The fetched directory does not match CONTRACT_ADDRESS.", 502);
    }
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => {});
    }
    return snapshot;
  })();
  pending.set(file, job);
  void job.finally(() => { if (pending.get(file) === job) pending.delete(file); }).catch(() => {});
  return job;
}

export async function listCachedAgents(env: NodeJS.ProcessEnv = process.env) {
  try {
    const snapshot = await readAgentCache(env);
    const agents = snapshot.agents.filter((agent) => agent.active);
    return {
      agents, total: agents.length, registeredTotal: snapshot.total,
      inactiveCount: snapshot.agents.length - agents.length,
      contractAddress: snapshot.contractAddress, chainId: snapshot.chainId,
      blockNumber: snapshot.blockNumber, updatedAt: snapshot.updatedAt,
      source: "Local JSON snapshot of the Deploy registry",
      availability: "Entries marked active by their owners as of updatedAt. Server availability, identity, and pricing have not been verified. Refresh Deploy for current registry data.",
    };
  } catch (error) {
    return { agents: [], total: 0, error: error instanceof Error ? error.message : "Refresh agents in Deploy first." };
  }
}
