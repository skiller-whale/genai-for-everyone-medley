import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Every attempt at every reply, kept on disk so the coach's file survives a
// restart. The page shows one attempt at a time; the coach sees them all.

export interface Attempt {
  text: string;
  tool?: string;
  tokens: number;
  stopped?: boolean;
}

export interface LoggedChat {
  id: string;
  title: string;
  tools: boolean;
  started: string;
  /** One entry per user message, in order. */
  turns: { user: string; attempts: Attempt[] }[];
}

export const COACH_FILE = 'CHAT.md';

export class ChatLog {
  chats: LoggedChat[] = [];

  constructor(
    private dataDir: string,
    private coachDir?: string,
  ) {
    const file = join(dataDir, 'chats.json');
    if (existsSync(file)) {
      try {
        this.chats = JSON.parse(readFileSync(file, 'utf8'));
      } catch {}
    }
  }

  get(id: string) {
    return this.chats.find((c) => c.id === id);
  }

  /** Records an attempt at the reply to user message number `index`. */
  record(id: string, title: string, tools: boolean, index: number, user: string, attempt: Attempt) {
    let chat = this.get(id);
    if (!chat) {
      chat = { id, title, tools, started: new Date().toISOString(), turns: [] };
      this.chats.push(chat);
    }
    // A learner who carries on after flipping to an earlier attempt can't
    // rewrite the past, so a turn is only ever added at the end or retried.
    chat.turns.length = Math.min(chat.turns.length, index + 1);
    chat.turns[index] ??= { user, attempts: [] };
    chat.turns[index].attempts.push(attempt);
    this.save();
  }

  save() {
    try {
      write(this.dataDir, 'chats.json', JSON.stringify(this.chats, null, 1));
      if (this.coachDir) write(this.coachDir, COACH_FILE, coachSummary(this.chats));
    } catch (err) {
      console.error('Could not save the chat log:', err);
    }
  }
}

// Write then rename, so the sync never reads a half-written file. The
// temporary name has no .md extension, so the sync ignores it.
function write(dir: string, name: string, contents: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${name}.tmp`);
  writeFileSync(tmp, contents);
  renameSync(tmp, join(dir, name));
}

const oneLine = (text: string, max = 300) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function coachSummary(chats: LoggedChat[]): string {
  const lines = ['# Chat: everything this learner has asked', ''];
  if (!chats.length) lines.push('No chats yet.');
  chats.forEach((chat, i) => {
    lines.push(`## ${i + 1}. ${oneLine(chat.title, 60)}${chat.tools ? ' (calculator on)' : ''}`, '');
    for (const turn of chat.turns) {
      lines.push(`> ${oneLine(turn.user)}`, '');
      const many = turn.attempts.length > 1;
      turn.attempts.forEach((a, k) => {
        const label = many ? `attempt ${k + 1}: ` : '';
        const tool = a.tool ? `[${a.tool}] ` : '';
        lines.push(`- ${label}${tool}${oneLine(a.text) || '(empty)'}${a.stopped ? ' (stopped)' : ''} _(${a.tokens} tokens)_`);
      });
      lines.push('');
    }
  });
  return lines.join('\n');
}
