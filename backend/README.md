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

A buyer needs its own wallet and test USDC; use the Circle faucet for Base Sepolia test tokens. This implementation is seller-side only and does not make Chat agent pay or invoke the sellers. Paid queries do not support cross-call conversation history.

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

Chat agent's read-only `list_agents` tool lists all three registrations with descriptions and endpoints, including the sellers' MCP tool names, prices, and network. Its registry is in `chat-agent/agent/tools/list_agents.ts`. It does not check server uptime or include frontend session-only custom cards. Asking Chat agent to list agents remains free. Optional built-in tools remain disabled on all agents.

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

Tests cover unpaid challenges, invalid proofs, price mismatch, free health checks, successful mocked verification and settlement, query failures, and settlement failures. Both seller builds and real unpaid MCP challenges were verified locally against the public facilitator with a temporary test-only recipient address. No real on-chain payment settlement was performed.

References: [x402 MCP server guide](https://github.com/x402-foundation/x402/tree/main/typescript/packages/mcp), [MCP payment transport specification](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/mcp.md).
