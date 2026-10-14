/** Decode newline-delimited JSON, including records split across network chunks. */
export async function* readNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) yield JSON.parse(line) as T;
      }
      if (done) break;
      if (pending.length > 1_000_000) throw new Error("Chat stream record is too large.");
    }
    if (pending.trim()) yield JSON.parse(pending) as T;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
