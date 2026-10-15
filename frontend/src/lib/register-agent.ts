import { BrowserProvider, getAddress, Interface, ZeroAddress, type Eip1193Provider } from "ethers";

export type AgentRegistration = { name: string; wallet: string; description: string; endpointUrl: string };

export const registrationAbi = new Interface([
  "function addAgent(string name, address wallet) returns (uint256)",
  "function addAgentWithDetails(string name, address wallet, string description, string endpointUrl) returns (uint256)",
  "event AgentAdded(uint256 indexed agentId, string name, address indexed wallet)",
]);

export function validateRegistration(input: AgentRegistration): AgentRegistration {
  const data = { name: input.name.trim(), wallet: input.wallet.trim(), description: input.description.trim(), endpointUrl: input.endpointUrl.trim() };
  const size = (text: string) => new TextEncoder().encode(text).length;
  if (!data.name || size(data.name) > 128) throw new Error("Enter an agent name of 1–128 bytes.");
  try {
    data.wallet = getAddress(data.wallet);
    if (data.wallet === ZeroAddress) throw new Error();
  } catch { throw new Error("Enter a valid nonzero payment wallet address."); }
  if (size(data.description) > 2048) throw new Error("Description must be at most 2,048 bytes.");
  if (size(data.endpointUrl) > 512) throw new Error("Endpoint must be at most 512 bytes.");
  if (data.endpointUrl) {
    try {
      const url = new URL(data.endpointUrl);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error();
    } catch { throw new Error("Enter an HTTP or HTTPS endpoint URL without credentials."); }
  }
  return data;
}

/** Only the connected browser wallet sends this transaction; no backend key is used. */
export async function submitRegistration(ethereum: Eip1193Provider, contractAddress: string, input: AgentRegistration) {
  const agent = validateRegistration(input);
  const target = getAddress(contractAddress);
  if (target === ZeroAddress) throw new Error("The registry contract address is invalid.");
  // Establish the site's account permission before prompting for a network change.
  const accounts: unknown = await ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("Connect an account in your browser wallet.");
  if (await ethereum.request({ method: "eth_chainId" }) !== "0x14a34") {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
  }
  // Re-read after a possible switch so an account change cannot leave a stale sender.
  const connected: unknown = await ethereum.request({ method: "eth_accounts" });
  if (!Array.isArray(connected) || typeof connected[0] !== "string") throw new Error("Reconnect your wallet account before registering.");
  const from = getAddress(connected[0]);
  if (await ethereum.request({ method: "eth_chainId" }) !== "0x14a34") throw new Error("Select Base Sepolia in your wallet before registering.");
  if (await ethereum.request({ method: "eth_getCode", params: [target, "latest"] }) === "0x") throw new Error("No registry contract was found on Base Sepolia.");
  const data = agent.description || agent.endpointUrl
    ? registrationAbi.encodeFunctionData("addAgentWithDetails", [agent.name, agent.wallet, agent.description, agent.endpointUrl])
    : registrationAbi.encodeFunctionData("addAgent", [agent.name, agent.wallet]);
  const hash: unknown = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: target, data, value: "0x0", chainId: "0x14a34" }] });
  if (typeof hash !== "string" || !/^0x[\da-fA-F]{64}$/.test(hash)) throw new Error("Wallet did not return a valid transaction hash. Check wallet activity before trying again.");
  return hash;
}

export async function checkRegistration(ethereum: Eip1193Provider, contractAddress: string, hash: string) {
  if (await ethereum.request({ method: "eth_chainId" }) !== "0x14a34") throw new Error("Select Base Sepolia in your wallet to check confirmation.");
  const provider = new BrowserProvider(ethereum);
  try {
    const receipt = await provider.getTransactionReceipt(hash);
    if (!receipt) return { status: "pending" as const };
    if (receipt.status !== 1) return { status: "reverted" as const };
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
      const event = registrationAbi.parseLog(log);
      if (event?.name === "AgentAdded") return { status: "confirmed" as const, agentId: event.args.agentId.toString() as string };
    }
    throw new Error("Transaction was mined, but no AgentAdded event was found. Check the transaction before registering again.");
  } finally { provider.destroy(); }
}

export function registrationError(error: unknown) {
  const code = (error as { code?: number | string } | null)?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return "Wallet request cancelled. No registration was submitted by this request.";
  if (code === 4902) return "Add Base Sepolia (chain ID 84532) in your wallet, then try again.";
  if (code === -32002) return "A wallet request is already open. Complete it in your wallet.";
  if (code === "INSUFFICIENT_FUNDS") return "Your signing wallet needs Base Sepolia ETH for registration gas.";
  return error instanceof Error ? error.message.slice(0, 350) : "Could not register this agent. Check your wallet and try again.";
}
