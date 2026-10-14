import { deepStrictEqual, rejects } from "node:assert/strict";
import { test } from "node:test";
import { readNdjson } from "./ndjson";
import { readAgentReply } from "./chat-stream";

function chunks(text: string, size = 7) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(output) {
    for (let index = 0; index < bytes.length; index += size) output.enqueue(bytes.slice(index, index + size));
    output.close();
  } });
}

async function collect<T>(stream: AsyncIterable<T>) {
  const result: T[] = [];
  for await (const item of stream) result.push(item);
  return result;
}

test("NDJSON preserves UTF-8 and records split across chunks, including an unterminated final line", async () => {
  deepStrictEqual(await collect(readNdjson(chunks('{"text":"Hello 🌍"}\r\n\n{"text":"Bye"}', 1))), [{ text: "Hello 🌍" }, { text: "Bye" }]);
});

test("completed message replaces streamed deltas without duplicating the answer", async () => {
  const events = [
    { type: "turn.started", data: { turnId: "turn-1" } },
    { type: "message.appended", data: { messageDelta: "Hi" } },
    { type: "message.appended", data: { messageDelta: " there" } },
    { type: "message.completed", data: { message: "Hi there" } },
    { type: "turn.completed", data: {} },
  ];
  deepStrictEqual(await collect(readAgentReply(chunks(events.map((event) => JSON.stringify(event)).join("\n")), 0)), [
    { type: "text", text: "Hi", streamIndex: 2 },
    { type: "text", text: "Hi there", streamIndex: 3 },
    { type: "text", text: "Hi there", streamIndex: 4 },
    { type: "done", streamIndex: 5 },
  ]);
});

test("follow-ups skip old delivery boundaries while advancing the durable cursor", async () => {
  const events = [
    { type: "turn.completed", data: {}, meta: { deliveryIds: ["old"] } },
    { type: "session.waiting", data: {} },
    { type: "turn.started", data: { turnId: "turn-2" }, meta: { deliveryIds: ["new"] } },
    { type: "message.completed", data: { message: "Follow-up answer", turnId: "turn-2" }, meta: { deliveryIds: ["new"] } },
    { type: "turn.completed", data: { turnId: "turn-2" }, meta: { deliveryIds: ["new"] } },
  ];
  deepStrictEqual(await collect(readAgentReply(chunks(events.map((event) => JSON.stringify(event)).join("\n")), 5, "new")), [
    { type: "text", text: "Follow-up answer", streamIndex: 9 },
    { type: "done", streamIndex: 10 },
  ]);
});

test("provider failures produce an error and truncated streams never count as success", async () => {
  const result = await collect(readAgentReply(chunks('{"type":"turn.failed","data":{"message":"provider failure"}}'), 0));
  deepStrictEqual(result.map((event) => event.type), ["error"]);
  await rejects(collect(readAgentReply(chunks('{"type":"message.appended","data":{"messageDelta":"partial"}}'), 0)), /before the agent finished/);
});
