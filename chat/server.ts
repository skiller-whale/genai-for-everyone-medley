import index from './src/client/index.html';
import type { ChatRequest, ReplyEvent } from './src/shared/types';
import { COACH_SYNC_DIR, DATA_DIR, loadConfig, MOCK_MODEL, PORT } from './src/server/config';
import { ChatLog, type Attempt } from './src/server/log';
import { generate } from './src/server/model';

// One Bun server: the page, its config, and a streaming chat endpoint.

const config = loadConfig();
const log = new ChatLog(DATA_DIR, COACH_SYNC_DIR);
log.save();

/** What the page needs from the config: never the model id. */
const publicConfig = {
  title: config.title,
  welcome: config.welcome,
  footer: config.footer,
  footerWithTools: config.footerWithTools,
  tools: config.tools.length > 0,
  suggestions: config.suggestions,
};

function validRequest(body: unknown): body is ChatRequest {
  const b = body as ChatRequest;
  return (
    typeof b?.chatId === 'string' &&
    typeof b.title === 'string' &&
    typeof b.tools === 'boolean' &&
    Array.isArray(b.history) &&
    b.history.length % 2 === 1 &&
    b.history.every((t, i) => typeof t?.text === 'string' && t.role === (i % 2 ? 'assistant' : 'user'))
  );
}

async function chat(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!validRequest(body)) return Response.json({ error: 'Bad request' }, { status: 400 });
  if (body.tools && !publicConfig.tools) return Response.json({ error: 'Tools are not available' }, { status: 400 });
  // Tools are fixed for the whole chat, so retries compare like with like.
  const existing = log.get(body.chatId);
  if (existing && existing.tools !== body.tools) {
    return Response.json({ error: 'Tools cannot change once a chat has started' }, { status: 409 });
  }

  const turnIndex = (body.history.length - 1) / 2;
  const userText = body.history.at(-1)!.text;
  const attempt: Attempt = { text: '', tokens: 0 };
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ReplyEvent) => {
        if (event.type === 'text') attempt.text += event.text;
        if (event.type === 'tool') attempt.tool = attempt.tool ? `${attempt.tool}; ${event.text}` : event.text;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        } catch {}
      };
      try {
        attempt.tokens = await generate(config.model, body.history, body.tools, req.signal, emit);
        emit({ type: 'done', tokens: attempt.tokens });
      } catch (err) {
        if (req.signal.aborted) attempt.stopped = true;
        else {
          console.error('Model error:', err);
          emit({ type: 'error', message: 'Something went wrong getting a reply. Please try again.' });
          attempt.text ||= '(error)';
        }
      }
      if (req.signal.aborted) attempt.stopped = true;
      log.record(body.chatId, body.title, body.tools, turnIndex, userText, attempt);
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}

Bun.serve({
  port: PORT,
  idleTimeout: 120,
  development: process.env.NODE_ENV !== 'production',
  routes: {
    '/': index,
    '/tools': index,
    '/api/config': () => Response.json(publicConfig),
    '/api/chat': { POST: chat },
  },
  fetch: () => new Response('Not found', { status: 404 }),
});

console.log(`Chat on http://localhost:${PORT}${MOCK_MODEL ? ' (mock model)' : ` with ${config.model}`}`);
