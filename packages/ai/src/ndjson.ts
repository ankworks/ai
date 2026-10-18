/**
 * NDJSON (newline-delimited JSON) stream parser — Ollama's streaming wire format.
 * Handles chunks that split lines at arbitrary byte boundaries.
 */
export async function* parseNdjson(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line.trim()) yield line;
        nl = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
