# Agentonchain

Agentonchain is a prototype workspace for discovering AI agents, talking to them, and paying an agent when you use its service. It brings together conversational AI, agent-to-agent payments, and a Solidity registry for recording agent details on-chain.

The idea is simple: a user can ask a conversational agent for help, choose another agent for a task, and let the conversational agent pay that provider within a configured spending limit. Agent providers expose their services through paid endpoints and receive USDC for successful requests.

The current implementation runs locally. Payments use **test USDC on Base Sepolia**, and all three agents use Groq for their model responses. The Solidity registry is a separate contract that can be deployed through Remix; the app does not read from it yet.

## What the project demonstrates

Agent services need a way to describe what they do, expose an endpoint, and receive payment for their work. Users also need a way to find those services and control how much an assistant can spend on their behalf.

Agentonchain explores that workflow through three parts:

1. **A user workspace** for conversations, agent discovery, and payment wallet settings.
2. **An agent backend** where a free conversational agent can call paid agents through a payment-aware protocol.
3. **An on-chain directory** that stores an agent's name, wallet, description, endpoint, and active status.

The backend payment flow and the Solidity directory are currently independent. Registering an agent in the contract does not automatically make it available to Chat agent.

## The user experience

### Chat

After signing in with the demo credentials, the user can send messages to Chat agent. Replies stream into the interface, and the backend session retains context for follow-up questions.

Ordinary questions are free. Chat agent can also list the agents registered in the backend and explain their capabilities. When the user explicitly asks it to use a paid agent, it can invoke that agent and return the answer with payment information.

For example:

> Use Everyday helper to explain how an API works.

This selects Everyday helper for a paid request. Asking Chat agent the same question directly does not require a paid-agent call.

### Agent discovery

The **Deploy** tab currently displays a searchable local agent card with a description, skills, and endpoint information. It is a directory view; it does not deploy a server or a smart contract.

The frontend card data is separate from the backend registry and currently lists only Agentonchain assistant. Its displayed endpoint and payment details still need to be aligned with the paid backend. Chat agent's `list_agents` tool uses the backend registry, which includes all three agents.

### Payment card

The **Cards** tab lets the user save a public buyer-wallet address and a maximum USDC amount per call. The address must match the wallet configured on the backend.

The card is spending configuration, rather than a credit card or a browser-wallet connection. The private key stays in the backend environment. The backend enforces the lower of the card's limit and its own configured spending cap.

Login state, visible chat messages, and the saved card stay in the current browser session's component state and clear on reload or sign-out.

## The agents

| Agent | Role | Local endpoint | Cost |
| --- | --- | --- | --- |
| Chat agent | Answers questions, lists registered agents, and invokes a selected paid agent | `http://127.0.0.1:2002/eve/v1/session` | Free |
| Agentonchain assistant | Answers general questions with explanations and examples | `http://127.0.0.1:2000/mcp` | 0.01 test USDC per call |
| Everyday helper | Answers everyday questions with practical guidance | `http://127.0.0.1:2001/mcp` | 0.01 test USDC per call |

Each agent runs as an independent Eve service. The default model is `openai/gpt-oss-20b`, hosted by Groq, and can be changed through `GROQ_MODEL`.

The two paid agents answer from model knowledge and have no tools. Chat agent has two project tools: `list_agents` and `invoke_paid_agent`. These agents do not browse the web, run code, or deploy services.

## How a paid request works

The paid agents expose an `ask_agent` tool through **MCP (Model Context Protocol)**. Payments use **x402**, which lets a service return a payment requirement that a compatible client can satisfy before receiving the result.

1. The user saves a payment card and explicitly asks Chat agent to use a registered paid agent.
2. Chat agent calls `invoke_paid_agent` with the selected agent ID and query. The backend resolves the endpoint from its trusted registry.
3. The seller returns an x402 payment challenge for **0.01 test USDC**.
4. The buyer validates the price, seller recipient, Base Sepolia network, USDC token, and spending limits before signing a payment authorization.
5. The seller's facilitator verifies the authorization before the agent generates an answer.
6. After successful generation, the facilitator settles the payment. The answer is released only after successful settlement.
7. Chat agent receives the answer and transaction receipt and uses them to respond to the user.

Missing or invalid payment authorization never starts a paid query. An agent-generation error is not settled. If payment was authorized but a confirmed result cannot be obtained, the buyer reports the uncertain outcome and does not automatically retry.

A local ledger allows only one paid invocation per chat turn. A replay of the same completed invocation returns the cached result and receipt. This guard uses local storage and is intended for a single-host setup.

## The Solidity registry

[`solidity/AgentRegistry.sol`](solidity/AgentRegistry.sol) provides a public directory that can be deployed independently through Remix. Each entry stores:

- The agent's name and description.
- A payment wallet address.
- An API or MCP endpoint URL.
- The account that owns the registry entry.
- Whether the entry is active.

Anyone can register an agent. The account submitting the registration owns that entry and is the only account allowed to update its details or deactivate and reactivate it. The payment wallet can be different from the owner account.

The contract supports basic registration, registration with details, updates, active-status changes, individual reads, paginated reads, and total and active counts. IDs start at zero and remain stable when an entry is deactivated.

The contract records directory information. It does not run an AI model, verify agent identity or wallet ownership, check endpoint availability, or process x402 payments. Duplicate entries are allowed. Its active flag does not stop a backend server.

See [contract deployment and function instructions](solidity/README.md).

## Codebase structure

```text
frontend/
  src/app/              Login page and server-side chat/wallet proxies
  src/components/       Workspace, agent cards, and payment card UI
  src/lib/              Stream parsing, demo auth, and frontend types/data

backend/
  agent/                Paid Agentonchain assistant
  everyday-helper/      Paid Everyday helper
  chat-agent/           Free Chat agent and its discovery/payment tools
  payments/             Trusted registry, x402 buyer/seller, and local ledger
  scripts/              Commands for running the agent services

solidity/
  AgentRegistry.sol     Standalone on-chain agent directory
```

The frontend uses **Next.js, React, and TypeScript**. The backend uses **Eve, Groq, MCP, x402, and viem**. The registry is written in **Solidity**.

## Run locally

Use **Node.js 24 or newer** and **Bun**.

### 1. Configure and start the backend

From `backend/`:

```sh
npm install
cp -n .env.example .env.local
```

Set the relevant values in `backend/.env.local`:

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Required for model responses from all three agents |
| `GROQ_MODEL` | Optional model override; defaults to `openai/gpt-oss-20b` |
| `X402_RECIPIENT` | Public wallet address receiving payments for both paid agents |
| `ACC_PRIVATE_KEY` | Dedicated buyer-wallet private key used by Chat agent for paid requests |
| `X402_MAX_PER_CALL_USDC` | Backend spending cap; defaults to `0.01` |
| `X402_FACILITATOR_URL` | Optional facilitator URL; defaults to `https://x402.org/facilitator` |

The buyer wallet needs Base Sepolia test USDC for paid requests. Keep private keys in the ignored backend environment file; the Cards form takes only the public address and spending limit.

```sh
npm run dev:all
```

This starts the three agents on ports **2000**, **2001**, and **2002**. Free conversations require Groq configuration; paid calls additionally require the seller and buyer payment settings.

### 2. Start the frontend

In another terminal, from `frontend/`:

```sh
bun install
bun run dev
```

Open the URL printed by Next.js and sign in with:

| Field | Value |
| --- | --- |
| Username | `demo` |
| Password | `demo123` |

The frontend defaults to Chat agent at `http://127.0.0.1:2002`. Set the server-side `CHAT_AGENT_URL` variable if the backend runs elsewhere.

### 3. Try a paid agent

Open **Cards**, save the public address shown for the configured backend signer, and set a per-call limit of at least `0.01` USDC. Then ask Chat agent to use Agentonchain assistant or Everyday helper.

Deploying the Solidity registry is optional for this local flow because the backend currently uses its own static agent registry.

## Current scope

This repository is a local prototype with demo authentication and testnet payments. It does not yet provide production user accounts, per-user signing wallets, a distributed payment ledger, automatic agent deployment, or an app integration with the on-chain directory.

Payment tests use mocked facilitator responses and do not establish real on-chain settlement. Contract deployment and a live paid request require separate verification in the selected environment.

For detailed setup and protocol behavior, see the [backend README](backend/README.md), [payment documentation](backend/PAYMENTS.md), and [Solidity README](solidity/README.md).
