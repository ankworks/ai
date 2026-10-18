/**
 * Mock Ollama-compatible server for local/live end-to-end runs (NO real cloud
 * account needed). Implements POST /api/chat (NDJSON streaming) and
 * GET /api/tags. Not part of production code — used by e2e smoke scripts.
 *
 *   node scripts/mock-ollama.mjs [port]
 */

import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 11434);

const server = createServer((req, res) => {
  const url = req.url ?? '';

  if (req.method === 'GET' && (url === '/api/tags' || url.endsWith('/tags'))) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        models: [
          { name: 'llama3.3:70b' },
          { name: 'llama3.1:8b' },
          { name: 'gemma3:27b' },
          { name: 'qwen2.5-coder:32b' },
        ],
      }),
    );
    return;
  }

  if (req.method === 'GET' && (url === '/api/version' || url.endsWith('/version'))) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ version: '0.0.0-mock' }));
    return;
  }

  if (req.method === 'POST' && (url === '/api/chat' || url.endsWith('/chat'))) {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {
        /* keep defaults */
      }
      const model = typeof parsed.model === 'string' ? parsed.model : 'mock';
      const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      const lastUser = [...messages].reverse().find((m) => m?.role === 'user');
      const promptText =
        typeof lastUser?.content === 'string'
          ? lastUser.content
          : JSON.stringify(lastUser?.content ?? '');
      const reply = `Mock reply from ${model}: you said "${promptText.slice(0, 80)}".`;

      // Stream reply in word-sized NDJSON chunks like a real provider.
      const words = reply.split(' ');
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const promptTokens = Math.max(1, Math.ceil(promptText.length / 4));
      let i = 0;
      const timer = setInterval(() => {
        if (i >= words.length) {
          res.write(
            `${JSON.stringify({
              model,
              message: { role: 'assistant', content: '' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: promptTokens,
              eval_count: Math.max(1, words.length),
            })}\n`,
          );
          res.end();
          clearInterval(timer);
          return;
        }
        const chunk = i === 0 ? words[i] : ` ${words[i]}`;
        i += 1;
        res.write(
          `${JSON.stringify({ model, message: { role: 'assistant', content: chunk }, done: false })}\n`,
        );
      }, 10);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `mock: no route for ${req.method} ${url}` }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`mock-ollama listening on http://0.0.0.0:${port}`);
});
