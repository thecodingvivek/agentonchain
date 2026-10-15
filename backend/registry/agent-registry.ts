import { Contract, FetchRequest, getAddress, JsonRpcProvider, ZeroAddress } from "ethers";

// Matches solidity/AgentRegistry.sol. Read operations never use ACC_PRIVATE_KEY.
export const registryAbi = [
  "function getAgentCount() view returns (uint256)",
  "function getAgents(uint256 offset, uint256 limit) view returns (tuple(string name, address wallet, address owner, string description, string endpointUrl, bool active)[])",
];

export type RegistryAgent = {
  id: string;
  name: string;
  wallet: string;
  owner: string;
  description: string;
  endpointUrl: string;
  active: boolean;
};

export type RegistrySnapshot = {
  agents: RegistryAgent[];
  total: string;
  contractAddress: string;
  chainId: number;
  blockNumber: number;
  updatedAt: string;
};

export class RegistryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseOffset(value: string | null): bigint {
  if (value !== null && !/^(0|[1-9]\d{0,19})$/.test(value)) {
    throw new RegistryError("Invalid registry page offset.", 400);
  }
  return BigInt(value ?? "0");
}

export async function readRegistrySnapshot(env: NodeJS.ProcessEnv = process.env): Promise<RegistrySnapshot> {
  let contractAddress: string;
  try {
    contractAddress = getAddress(env.CONTRACT_ADDRESS?.trim() ?? "");
    if (contractAddress === ZeroAddress) throw new Error();
  } catch {
    throw new RegistryError("Set CONTRACT_ADDRESS to your deployed registry address in backend/.env.local, then restart Chat agent.", 503);
  }

  const rpcUrl = env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org";
  try {
    const url = new URL(rpcUrl);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new RegistryError("BASE_SEPOLIA_RPC_URL must be a valid HTTP or HTTPS RPC URL.", 503);
  }

  const request = new FetchRequest(rpcUrl);
  request.timeout = 8000;
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== 84532n) throw new RegistryError("The registry RPC must connect to Base Sepolia (chain 84532).", 503);
    const blockNumber = await provider.getBlockNumber();
    if (await provider.getCode(contractAddress, blockNumber) === "0x") {
      throw new RegistryError("No contract was found at CONTRACT_ADDRESS on Base Sepolia.", 502);
    }
    const contract = new Contract(contractAddress, registryAbi, provider);
    // Count and entries come from the same block, including during a refresh.
    const total: bigint = await contract.getAgentCount({ blockTag: blockNumber });
    const agents: RegistryAgent[] = [];
    // Finish the entire snapshot before returning or replacing the shared JSON file.
    for (let offset = 0n; offset < total; offset += 24n) {
      const entries: Omit<RegistryAgent, "id">[] = await contract.getAgents(offset, 24n, { blockTag: blockNumber });
      const expected = total - offset < 24n ? total - offset : 24n;
      if (BigInt(entries.length) !== expected) throw new Error("Incomplete registry page");
      agents.push(...entries.map((agent, index) => ({
        id: (offset + BigInt(index)).toString(),
        name: agent.name,
        wallet: agent.wallet,
        owner: agent.owner,
        description: agent.description,
        endpointUrl: agent.endpointUrl,
        active: agent.active,
      })));
    }
    return {
      agents, total: total.toString(), contractAddress, chainId: 84532,
      blockNumber, updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    throw new RegistryError("Could not read AgentRegistry on Base Sepolia. Check the RPC connection and that the deployed contract matches solidity/AgentRegistry.sol, then refresh.", 502);
  } finally {
    provider.destroy();
  }
}

export function registryPage(snapshot: RegistrySnapshot, offset: bigint) {
  const total = BigInt(snapshot.total);
  const agents = offset < total ? snapshot.agents.slice(Number(offset), Number(offset + 24n)) : [];
  const next = offset + BigInt(agents.length);
  return { ...snapshot, agents, nextOffset: agents.length && next < total ? next.toString() : null };
}

export async function readRegistryPage(offset: bigint, env: NodeJS.ProcessEnv = process.env) {
  return registryPage(await readRegistrySnapshot(env), offset);
}
