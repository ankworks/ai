import { describe, expect, it } from 'vitest';
import { parseNdjson } from './ndjson';

async function push(lines: Array<string | Uint8Array>): Promise<string[]> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(typeof line === 'string' ? encoder.encode(line) : line);
      }
      controller.close();
    },
  });
  const out: string[] = [];
  for await (const line of parseNdjson(stream)) out.push(line);
  return out;
}

describe('parseNdjson', () => {
  it('splits complete lines', async () => {
    expect(await push(['{"a":1}\n{"b":2}\n'])).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('reassembles lines split across arbitrary byte boundaries', async () => {
    const full = new TextEncoder().encode('{"hello":"world"}\n{"second":true}\n');
    const cut = 7; // split mid-key
    expect(await push([full.slice(0, cut), full.slice(cut)])).toEqual([
      '{"hello":"world"}',
      '{"second":true}',
    ]);
  });

  it('keeps a trailing line without a newline', async () => {
    expect(await push(['{"tail":1}'])).toEqual(['{"tail":1}']);
  });

  it('skips blank keep-alive lines', async () => {
    expect(await push(['\n\n{"x":1}\n'])).toEqual(['{"x":1}']);
  });

  it('handles multi-byte UTF-8 characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"tiếng Việt"}\n');
    const cut = bytes.indexOf(0xcc) + 1; // inside a composed char sequence
    const lines = await push([bytes.slice(0, cut), bytes.slice(cut)]);
    expect(JSON.parse(lines[0] ?? '')).toEqual({ t: 'tiếng Việt' });
  });
});
