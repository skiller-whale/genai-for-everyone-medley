import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { calculate } from '../calc';
import type { ReplyEvent, Turn } from '../shared/types';
import { ATTENDANCE_ID, BEDROCK_ENDPOINT, INFERENCE, MOCK_MODEL } from './config';

export type Emit = (event: ReplyEvent) => void;

const CALCULATOR: Tool = {
  toolSpec: {
    name: 'calculate',
    description: 'Evaluates an arithmetic expression exactly. Supports + - * / ^ %, brackets and decimals.',
    inputSchema: {
      json: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'For example "3557 * 4289"' } },
        required: ['expression'],
      },
    },
  },
};

/** A model that answers tool requests in at most this many rounds. */
const MAX_TOOL_ROUNDS = 5;

let client: BedrockRuntimeClient | undefined;
const bedrock = () =>
  (client ??= new BedrockRuntimeClient({
    region: 'eu-west-1',
    endpoint: BEDROCK_ENDPOINT,
    credentials: { accessKeyId: ATTENDANCE_ID, secretAccessKey: 'unused' },
    // HTTP/1.1: the SDK's default for streams is HTTP/2, which the proxy may not speak.
    requestHandler: new NodeHttpHandler(),
  }));

export function runCalculator(input: unknown): { line: string; result: string } {
  const expression = String((input as { expression?: unknown })?.expression ?? '');
  try {
    const value = calculate(expression);
    return { line: `calculator: ${expression} = ${value}`, result: String(value) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { line: `calculator: ${expression} (error)`, result: `Error: ${message}` };
  }
}

/** Streams a reply to the conversation, returning the output token count. */
export async function generate(model: string, history: Turn[], tools: boolean, signal: AbortSignal, emit: Emit): Promise<number> {
  if (MOCK_MODEL) return mockGenerate(history, tools, signal, emit);

  const messages: Message[] = history.map((t) => ({ role: t.role, content: [{ text: t.text }] }));
  let tokens = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await bedrock().send(
      new ConverseStreamCommand({
        modelId: model,
        messages,
        inferenceConfig: INFERENCE,
        ...(tools ? { toolConfig: { tools: [CALCULATOR] } } : {}),
      }),
      { abortSignal: signal },
    );

    const content: ContentBlock[] = [];
    let text = '';
    let toolUse: { toolUseId: string; name: string; input: string } | undefined;
    const uses: NonNullable<typeof toolUse>[] = [];
    let stopReason: string | undefined;

    for await (const event of res.stream ?? []) {
      const start = event.contentBlockStart?.start?.toolUse;
      if (start) toolUse = { toolUseId: start.toolUseId!, name: start.name!, input: '' };
      const delta = event.contentBlockDelta?.delta;
      if (delta?.text) {
        text += delta.text;
        emit({ type: 'text', text: delta.text });
      }
      if (delta?.toolUse?.input && toolUse) toolUse.input += delta.toolUse.input;
      if (event.contentBlockStop) {
        if (text) content.push({ text });
        text = '';
        if (toolUse) uses.push(toolUse);
        toolUse = undefined;
      }
      if (event.messageStop) stopReason = event.messageStop.stopReason;
      if (event.metadata?.usage) tokens += event.metadata.usage.outputTokens ?? 0;
    }
    if (text) content.push({ text });

    if (stopReason !== 'tool_use' || !uses.length) return tokens;

    const results: ContentBlock[] = [];
    for (const use of uses) {
      let input: unknown = {};
      try {
        input = JSON.parse(use.input || '{}');
      } catch {}
      content.push({ toolUse: { toolUseId: use.toolUseId, name: use.name, input: input as never } });
      const { line, result } =
        use.name === 'calculate' ? runCalculator(input) : { line: `${use.name} (unknown tool)`, result: 'Error: no such tool' };
      emit({ type: 'tool', text: line });
      results.push({ toolResult: { toolUseId: use.toolUseId, content: [{ text: result }] } });
    }
    messages.push({ role: 'assistant', content }, { role: 'user', content: results });
  }
  return tokens;
}

// For local development and the emulator's smoke test: canned replies, streamed word by word.
async function mockGenerate(history: Turn[], tools: boolean, signal: AbortSignal, emit: Emit): Promise<number> {
  const prompt = history.at(-1)?.text ?? '';
  const sum = /(\d[\d,]*)\s*[×x*]\s*(\d[\d,]*)/.exec(prompt);
  let reply = `(Mock model for local testing) You said: "${prompt.slice(0, 80)}"\n\nHere is **some markdown**:\n\n- one\n- two`;
  if (sum && tools) {
    const { line, result } = runCalculator({ expression: `${sum[1]} * ${sum[2]}`.replace(/,/g, '') });
    emit({ type: 'tool', text: line });
    reply = `${sum[1]} × ${sum[2]} = ${Number(result).toLocaleString('en-GB')}`;
  } else if (sum) {
    reply = `${sum[1]} × ${sum[2]} = 15,256,573`;
  }
  const words = reply.split(/(?<=\s)/);
  for (const word of words) {
    if (signal.aborted) break;
    await Bun.sleep(25);
    emit({ type: 'text', text: word });
  }
  return words.length;
}
