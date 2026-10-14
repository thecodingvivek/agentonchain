# Agentonchain backend

Three Groq-powered eve agents run independently. Agentonchain assistant and Everyday helper sell answers through x402-protected MCP tools. Chat agent remains free and powers the frontend Chat interface.

| Agent | Start command (from backend/) | Query endpoint | Price |
| --- | --- | --- | --- |
| Agentonchain assistant | `npm run dev` | `http://127.0.0.1:2000/mcp` | 0.01 test USDC / `ask_agent` call |
| Everyday helper | `npm run dev:helper` | `http://127.0.0.1:2001/mcp` | 0.01 test USDC / `ask_agent` call |
| Chat agent | `npm run dev:chat` | `http://127.0.0.1:2002/eve/v1/session` | Free |

## Setup

Use Node.js 24 or newer (`nvm use` reads `.nvmrc`). From `backend/`:

```sh
npm install
cp -n .env.example .env.local
```

Set these values in the ignored `.env.local` file:

- `GROQ_API_KEY`: required for all three agents to produce answers.
- `GROQ_MODEL`: optional; defaults to `openai/gpt-oss-20b`, hosted on Groq.
- `X402_RECIPIENT`: required public Ethereum wallet address receiving test USDC for the paid tools. Blank, placeholder, and zero addresses are rejected. No seller private key is required.
- `X402_FACILITATOR_URL`: optional HTTPS URL; defaults to `https://x402.org/facilitator`.

Both seller agents use Base Sepolia only, identified by x402 v2 as `eip155:84532`. The price is fixed at `$0.01`, equivalent to `10000` atomic USDC units. `payments/paid-mcp.ts` owns the shared seller implementation. Restart servers after changing configuration.

The current development checkout reuses some ignored dependency links from a previous local installation. New payment dependencies are pinned in `package.json`; a fresh checkout needs `npm install`. These links and generated `.eve`/`.output` artifacts are not committed.

## Paid MCP tools

Start each seller in a separate terminal. Each exposes stateless Streamable HTTP MCP at `POST /mcp` on its own port. Tool discovery and `ping` are free. `ask_agent` accepts `{ "query": "your question" }` and requires payment on every call, with a fresh eve task for that query. It returns the agent's actual answer, rather than a placeholder research result. The agents do not browse the web or perform deep research.

This adapts the Cloudflare example to eve's `defineChannel` routes using the standard `McpServer` and official `@x402/mcp` payment wrapper. No Cloudflare `McpAgent` or Worker deployment is required.

1. Call `ask_agent` without payment. The MCP result has `isError: true`, x402 `PaymentRequired` in `structuredContent`, and the same JSON in `content[0].text`. MCP carries the payment challenge inside a JSON-RPC tool result; the transport HTTP response remains 200.
2. An x402-capable buyer creates a Base Sepolia USDC payment authorization and retries with its `PaymentPayload` in request `_meta["x402/payment"]`.
3. The facilitator verifies the payment before any Groq query starts. Missing or invalid payments never run the agent.
4. eve generates the answer. An agent error is returned with `isError: true` and is not settled.
5. The facilitator settles the authorization. Only successful settlement releases the answer, with the receipt in result `_meta["x402/payment-response"]`.

A buyer needs its own wallet and test USDC; use the Circle faucet for Base Sepolia test tokens. Chat agent can invoke a selected seller using its `invoke_paid_agent` tool and the buyer configuration below. Paid queries do not support cross-call conversation history.

Free health check (change port to 2001 for Everyday helper):

```sh
curl http://127.0.0.1:2000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ping","arguments":{}}}'
```

Unpaid request returning the payment challenge:

```sh
curl http://127.0.0.1:2000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"ask_agent","arguments":{"query":"Explain how an API works."}}}'
```

The seller agents' ordinary `/eve/v1/session` routes reject requests with 401, including during local development, so callers cannot bypass the MCP payment gate. Health checks at `/eve/v1/health` stay public. The old direct `ask` and `ask:helper` scripts were removed.

Missing payment configuration or facilitator failures return an MCP tool error and never fall back to a free query. `ping` and tool discovery remain available even before the recipient is configured.

## Free Chat agent

```sh
npm run dev:chat
# From another terminal:
npm run ask:chat -- "Explain what an API is."
```

The frontend Chat interface uses its `/api/chat` proxy to send queries to Chat agent, streams replies, and retains the session for follow-ups. `POST /eve/v1/session` accepts `{ "message": "your query" }` and returns a session ID. Read events at `/eve/v1/session/<sessionId>/stream`; follow-ups go to `POST /eve/v1/session/<sessionId>`. `ask:chat` waits for the answer.

Chat agent's read-only `list_agents` tool lists all three registrations with descriptions and endpoints, including the sellers' MCP tool names, prices, and network. The shared registry is in `payments/agent-registry.ts`. It does not check server uptime or include frontend session-only custom cards. Asking Chat agent to list agents remains free. Optional built-in tools remain disabled on all agents.

## Chat agent as an x402 buyer

Set `ACC_PRIVATE_KEY` in the ignored `backend/.env.local` file to the dedicated Base Sepolia buyer wallet key. The key is read only on the backend; never enter it in the Cards form or expose it through a `NEXT_PUBLIC_` variable. Set `X402_RECIPIENT` to the seller's receiving address, and optionally set `X402_MAX_PER_CALL_USDC` (default `0.01`). Both paid agents use that recipient. The buyer wallet needs test USDC.

Restart the three backend servers after editing `.env.local`. In the frontend **Cards** tab, copy the displayed public backend wallet address into the payment card and save a per-call limit of at least `0.01`. The saved address must match `ACC_PRIVATE_KEY`. Only one card can be saved.

Then ask Chat agent:

> Use Everyday helper to explain how an API works.

`invoke_paid_agent` accepts `{ agentId, query }`; agent IDs are restricted to `agentonchain-assistant` and `everyday-helper`. It resolves the endpoint from the server's registry, receives an x402 challenge, validates it before signing, and uses `@x402/mcp` with a viem signer to retry with a payment authorization. A successful result contains the seller's answer and settlement transaction receipt. Listing agents and normal Chat agent answers remain free.

The frontend `/api/chat` accepts public `paymentWallet` metadata alongside the message and session cursor. It forwards the card in `x-payment-wallet`. Chat agent's eve channel validates it and stores it in turn auth attributes; the model cannot supply wallet addresses or spending limits through tool arguments. Missing, invalid, or mismatched cards fail before payment.

Before signing, the buyer requires x402 v2, the exact scheme, Base Sepolia (`eip155:84532`), the known test USDC contract, exactly `10000` units (0.01 USDC), the configured seller recipient, and a timeout of at most 120 seconds. Optional payment extensions and alternate flows are rejected. The lower of the card's cap and `X402_MAX_PER_CALL_USDC` is enforced using integer USDC units.

A local ledger under the Chat agent's ignored `.eve/paid-calls/` directory reserves one paid invocation per chat turn. A replay of a completed identical call returns its cached answer and receipt. In-progress, failed, changed, and uncertain attempts are not automatically paid again. A network failure after authorization may have settled; check the wallet before explicitly trying again. Keep this ledger when restarting the local server. This guard is for one host with shared local storage; distributed deployment requires a shared durable ledger and real user authentication. The frontend mock login is a local demo, not authorization for a shared production wallet.

`GET /payments/wallet` returns only public signer metadata (`configured`, address, network, chain ID, and cap). The frontend's `/api/wallet` proxy uses it to show signer status in Cards. It never returns a private key or signed authorization.

## Validation and production builds

```sh
npm run typecheck
npm run test:payments # requires Bun; facilitator and query results are mocked
npm run info
npm run info:helper
npm run info:chat
npm run build
npm run build:helper
npm run build:chat
```

Serve built output with `npm start`, `npm run start:helper`, and `npm run start:chat`. Seller MCP calls are gated by x402 in both dev and production. Chat agent retains eve's existing route-auth defaults; configure production authentication before exposing its HTTP session API.

Tests cover seller challenges and failures plus buyer signing, recipient/price/network/token checks, wallet mismatch, caps, receipt handling, workflow replay, and uncertain settlement. Buyer tests verify a real EIP-712 signature made with a synthetic test key against an in-memory facilitator; they do not spend real funds. Both seller builds and real unpaid MCP challenges were verified locally against the public facilitator with a temporary test-only recipient address. No real on-chain payment settlement was performed.

References: [x402 MCP server guide](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mcp), [MCP payment transport specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/mcp.md).
