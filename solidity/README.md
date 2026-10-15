# Agent registry

`AgentRegistry.sol` is a standalone Solidity contract with no imports or constructor arguments.

## Deploy in Remix

1. Create `AgentRegistry.sol` in Remix and paste the contract into it.
2. Select Solidity compiler **0.8.20** and compile.
3. Open **Deploy & Run Transactions**, select your environment and wallet network, then deploy `AgentRegistry`.
4. Call `addAgent` with an agent name and its public wallet address.
5. Read `getAgentCount()` for the total, or `agents(id)` for an entry. The first ID is `0`.

## Directory functions

| Function | Purpose |
| --- | --- |
| `addAgent(name, wallet)` | Register a basic agent. |
| `addAgentWithDetails(name, wallet, description, endpointUrl)` | Register with a description and API/MCP endpoint. |
| `updateAgent(id, name, wallet, description, endpointUrl)` | Entry owner updates details and payment wallet. |
| `setAgentActive(id, active)` | Entry owner deactivates or reactivates an agent. |
| `getAgent(id)` | Read all details, including owner and active status. |
| `getAgents(offset, limit)` | Read a page of up to 100 entries, including inactive ones. IDs are `offset + index`. |
| `getAgentCount()` | Total registrations, including inactive entries. |
| `activeAgentCount()` | Total active entries. |

Anyone can register an agent. The account sending the registration transaction owns the entry and is the only account that can update it or change its active status. The payment wallet may be a different address; changing it does not transfer ownership. There is no admin, ownership transfer, or deletion.

Names must be 1–128 bytes, descriptions at most 2,048 bytes, and endpoints at most 512 bytes. Wallet addresses must be nonzero. Duplicate entries are allowed. Registration does not verify wallet ownership, endpoint availability, or agent identity. Active status is a directory flag and does not stop a backend server.

For this project's paid agents, the endpoint is `/mcp`, for example `http://127.0.0.1:2000/mcp` during local development. A loopback URL only works on the caller's own machine; use a reachable deployed endpoint for a shared directory.

The contract emits `AgentAdded`, `AgentUpdated`, and `AgentStatusChanged` events. It stores registration data only and does not handle payments or connect to the frontend automatically. If you already deployed the earlier contract, deploy this version to a new address; existing registrations are not migrated.
