// Shared between the page and the server.

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatRequest {
  chatId: string;
  title: string;
  tools: boolean;
  /** The conversation so far, ending with the user's message. */
  history: Turn[];
}

/** One line of the streamed reply (newline-delimited JSON). */
export type ReplyEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; text: string }
  | { type: 'done'; tokens: number }
  | { type: 'error'; message: string };
