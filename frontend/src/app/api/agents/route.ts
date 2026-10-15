export const maxDuration = 60;

export async function GET(request: Request) {
  const offset = new URL(request.url).searchParams.get("offset") ?? "0";
  if (!/^(0|[1-9]\d{0,19})$/.test(offset)) return Response.json({ error: "Invalid registry page offset." }, { status: 400 });
  try {
    const origin = (process.env.CHAT_AGENT_URL || "http://127.0.0.1:2002").replace(/\/$/, "");
    const response = await fetch(`${origin}/registry/agents?offset=${offset}`, {
      cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    const result = await response.json();
    return Response.json(response.ok ? result : { error: typeof result.error === "string" ? result.error : "The registry is unavailable. Restart Chat agent and refresh." }, {
      status: response.ok ? 200 : 502, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Cannot reach the registry service. Start or restart Chat agent with npm run dev:chat in backend, then refresh." }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
