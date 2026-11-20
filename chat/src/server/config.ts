import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Everything the server reads from its environment and the module's config file.

export interface Suggestion {
  title: string;
  prompt: string;
}

export interface ChatConfig {
  title: string;
  welcome: string;
  footer: string;
  footerWithTools: string;
  model: string;
  tools: string[];
  suggestions: Suggestion[];
}

const DEFAULTS: ChatConfig = {
  title: 'Chat',
  welcome: 'What would you like to ask?',
  footer: 'This AI has no tools and no internet access. Check anything important.',
  footerWithTools: 'The calculator tool is on in this chat. The AI still has no internet access.',
  model: 'eu.amazon.nova-pro-v1:0',
  tools: [],
  suggestions: [],
};

export function loadConfig(path = process.env.CONFIG_PATH ?? './config.json'): ChatConfig {
  const file = JSON.parse(readFileSync(resolve(path), 'utf8'));
  return { ...DEFAULTS, ...file };
}

export const PORT = Number(process.env.PORT ?? 3000);
export const MOCK_MODEL = !!process.env.MOCK_MODEL;
export const ATTENDANCE_ID = process.env.ATTENDANCE_ID ?? '';
export const BEDROCK_ENDPOINT = process.env.BEDROCK_ENDPOINT ?? 'https://bedrock-runtime.aws-proxy.skillerwhale.com';
export const DATA_DIR = resolve(process.env.DATA_DIR ?? './data');
export const COACH_SYNC_DIR = process.env.COACH_SYNC_DIR || undefined;

// The old Bedrock chat client's settings for Nova Pro. The instructor notes
// were written against these, so change them only after re-testing.
export const INFERENCE = { maxTokens: 4000, temperature: 0.5, topP: 1 };
