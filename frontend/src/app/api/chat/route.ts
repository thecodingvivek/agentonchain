import { readAgentReply, type ChatEvent } from "@/lib/chat-stream";

export const maxDuration = 180;

export async function POST(request: Request) {
  // This is the local demo's proxy, not an authenticated public chat service.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  if (!input || typeof input.message !== "string" || !input.message.trim() || input.message.length > 8000 ||
    (input.sessionId !== undefined && (typeof input.sessionId !== "string" || !/^[\w-]{1,200}$/.test(input.sessionId))) ||
    (input.streamIndex !== undefined && (!Number.isSafeInteger(input.streamIndex) || input.streamIndex < 0))) {
    return Response.json({ error: "Enter a message of up to 8,000 characters." }, { status: 400 });
  }

  if (input.paymentWallet !== undefined && input.paymentWallet !== null) {
    const wallet = input.paymentWallet;
    if (typeof wallet.address !== "string" || !/^0x[\da-fA-F]{40}$/.test(wallet.address) || /^0x0{40}$/i.test(wallet.address) ||
        wallet.chainId !== 84532 || wallet.network !== "base-sepolia" || typeof wallet.maxPerCallUsdc !== "string" ||
        !/^\d{1,6}(\.\d{1,6})?$/.test(wallet.maxPerCallUsdc) || Number(wallet.maxPerCallUsdc) <= 0) {
      return Response.json({ error: "Your payment card is invalid. Update it in Cards." }, { status: 400 });
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.paymentWallet) headers["x-payment-wallet"] = JSON.stringify({ address: input.paymentWallet.address, chainId: 84532, network: "base-sepolia", maxPerCallUsdc: input.paymentWallet.maxPerCallUsdc });

  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(180_000)]);
  let sessionId: string;
  let deliveryId: string | undefined;
  let backendUrl: string;
  try {
    backendUrl = (process.env.CHAT_AGENT_URL || "http://127.0.0.1:2002").replace(/\/$/, "");
    const path = input.sessionId ? `/eve/v1/session/${encodeURIComponent(input.sessionId)}` : "/eve/v1/session";
    let accepted: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      accepted = await fetch(`${backendUrl}${path}`, {
        method: "POST", headers,
        body: JSON.stringify({ message: input.message.trim() }), signal, cache: "no-store",
      });
      if (accepted.status !== 409 || attempt === 3) break;
      const body = await accepted.clone().json().catch(() => null);
      if (body?.error?.code !== "session_not_active" && body?.code !== "session_not_active") break;
      await accepted.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    if (!accepted?.ok) {
      return Response.json({ error: "The chat agent rejected this message. Try again.", resetSession: accepted?.status === 404 || accepted?.status === 410 }, { status: 502 });
    }
    const result = await accepted.json();
    sessionId = result.sessionId;
    deliveryId = result.deliveryId;
    if (typeof sessionId !== "string" || !/^[\w-]{1,200}$/.test(sessionId)) throw new Error("Invalid session");
    if (input.sessionId && sessionId !== input.sessionId) throw new Error("Mismatched session");
    if (input.sessionId && typeof deliveryId !== "string") throw new Error("Missing delivery id");
  } catch {
    controller.abort();
    return Response.json({ error: "Chat agent is unavailable. Start it with npm run dev:chat in the backend folder." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(output) {
      const send = (event: ChatEvent) => output.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "session", sessionId });
      try {
        const response = await fetch(`${backendUrl}/eve/v1/session/${encodeURIComponent(sessionId)}/stream?startIndex=${input.streamIndex ?? 0}`, { signal, cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("Cannot open stream");
        for await (const event of readAgentReply(response.body, input.streamIndex ?? 0, deliveryId)) send(event);
      } catch {
        if (!request.signal.aborted) send({ type: "error", message: "The agent connection was interrupted. Check the backend, then try again.", streamIndex: input.streamIndex ?? 0 });
      } finally {
        controller.abort();
        try { output.close(); } catch { /* Browser already disconnected. */ }
      }
    },
    cancel() { controller.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
