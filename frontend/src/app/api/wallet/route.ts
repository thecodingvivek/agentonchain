/** Return only public signer metadata; the private key stays on the backend. */
export async function GET() {
  try {
    const origin = (process.env.CHAT_AGENT_URL || "http://127.0.0.1:2002").replace(/\/$/, "");
    const response = await fetch(`${origin}/payments/wallet`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Wallet status unavailable");
    const value = await response.json();
    return Response.json({ configured: value.configured === true, address: typeof value.address === "string" ? value.address : null, maxPerCallUsdc: value.maxPerCallUsdc }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ configured: false, address: null, error: "Start Chat agent to check the backend wallet." }, { status: 503 }); }
}
