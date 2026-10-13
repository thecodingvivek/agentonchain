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
