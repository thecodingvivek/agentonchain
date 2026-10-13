# Agentonchain assistant

A basic eve agent that answers general questions. It has no optional tools, marketplace integrations, or payment handling. The frontend is not connected yet.

## Setup

Use Node.js 24 or newer.

```sh
cd backend
npm install
cp -n .env.example .env.local
```

Set `GROQ_API_KEY` in `.env.local` to your Groq key. Never commit this file. The agent uses `@ai-sdk/groq` to call Groq directly. Its default model is `openai/gpt-oss-20b`, a model hosted by Groq; this does not require an OpenAI or AI Gateway key. Set `GROQ_MODEL` to override it with another model available to your Groq account. Model availability is listed at https://console.groq.com/docs/models. Restart the backend after changing environment variables.

## Run and ask a question

```sh
npm run dev
```

With the server running, send a query from a second terminal:

```sh
npm run ask -- "Explain how a blockchain works in three sentences."
```

The `ask` command waits for the agent and prints eve's result JSON. You can also chat through the development terminal UI.

## HTTP API

The backend listens at `http://127.0.0.1:2000`, separate from the frontend on port 3000. eve provides the default local session API:

```sh
curl http://127.0.0.1:2000/eve/v1/health
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'Content-Type: application/json' \
  -d '{"message":"What is an AI agent?"}'
```

The POST accepts the query and returns a session ID; it does not return the answer synchronously. Read streamed events at `/eve/v1/session/<sessionId>/stream`, or use the `ask` command to wait for the answer.

## Validate and build

```sh
npm run typecheck
npm run info
npm run build
npm start
```

Runtime package versions are pinned to the locally available eve release. During initial setup, npm downloads were unavailable, so ignored links under `node_modules` reuse existing packages for validation, with a separate local cache. A fresh checkout needs `npm install`; those links are not part of the project. No credentials from that installation are reused. A live model answer needs a configured key and working network access.

## Second agent: Everyday helper

`everyday-helper/` is a separate general-purpose eve agent with its own instructions, session history, and local server. It uses the same Groq configuration as Agentonchain assistant. Its launcher reads `backend/.env.local`, so both agents share the configured `GROQ_API_KEY` and optional `GROQ_MODEL` without copying the key into another file.

Run both agents in separate terminals from `backend/`:

```sh
# Agentonchain assistant
npm run dev

# Everyday helper (second terminal)
npm run dev:helper
```

| Agent | Local server | Query endpoint |
| --- | --- | --- |
| Agentonchain assistant | http://127.0.0.1:2000 | http://127.0.0.1:2000/eve/v1/session |
| Everyday helper | http://127.0.0.1:2001 | http://127.0.0.1:2001/eve/v1/session |

Ask the helper while its server is running:

```sh
npm run ask:helper -- "Explain what an API is."
```

Inspect or build it with `npm run info:helper` and `npm run build:helper`. Serve its built output with `npm run start:helper`.

Both agents appear in the frontend's Explore section with these session endpoints. Their cards are local registrations, not uptime checks: a card does not mean its server is running. The frontend does not invoke either agent yet. Prices and ratings are unconfigured for these local agents. `POST /eve/v1/session` starts a session; answers arrive through eve's session stream.
