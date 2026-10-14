import { readNdjson } from "./ndjson";

export type ChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string; streamIndex: number }
  | { type: "done"; streamIndex: number }
  | { type: "error"; message: string; streamIndex: number };

type AgentEvent = {
  type: string;
  data: { messageDelta?: string; message?: string | null; turnId?: string };
  meta?: { deliveryIds?: string[] };
};

/** Track the durable cursor and ignore events from earlier deliveries. */
export async function* readAgentReply(body: ReadableStream<Uint8Array>, startIndex: number, deliveryId?: string): AsyncGenerator<ChatEvent> {
  let streamIndex = startIndex;
  let text = "";
  let turnId: string | undefined;
  for await (const event of readNdjson<AgentEvent>(body)) {
    streamIndex += 1;
    const terminalSession = event.type === "session.failed" || event.type === "session.completed";
    if (!terminalSession && deliveryId && !event.meta?.deliveryIds?.includes(deliveryId)) continue;
    if (event.type === "turn.started") turnId = event.data.turnId;
    if (!terminalSession && turnId && event.data.turnId && event.data.turnId !== turnId) continue;
    if (event.type === "message.appended" && typeof event.data.messageDelta === "string") {
      text += event.data.messageDelta;
      yield { type: "text", text, streamIndex };
    } else if (event.type === "message.completed" && typeof event.data.message === "string") {
      text = event.data.message;
      yield { type: "text", text, streamIndex };
    } else if (event.type === "turn.completed") {
      if (!text.trim()) throw new Error("The agent returned an empty answer. Try another message.");
      yield { type: "done", streamIndex };
      return;
    } else if (["step.failed", "turn.failed", "turn.cancelled", "session.failed", "session.completed", "input.requested"].includes(event.type)) {
      yield { type: "error", message: "Chat agent could not finish the reply. Check the backend and Groq configuration, then try again.", streamIndex };
      return;
    }
  }
  throw new Error("The connection ended before the agent finished. Try again.");
}
