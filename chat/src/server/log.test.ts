import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatLog, wrap } from './log';

test('the coach sees every attempt in full, in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-'));
  const log = new ChatLog(join(dir, 'data'), join(dir, 'coach'));
  const long = 'word '.repeat(200).trim();
  log.record('a', 'How many s', false, 0, 'How many s?', { text: '4', tokens: 3 });
  log.record('a', 'How many s', false, 0, 'How many s?', { text: long, tokens: 200 });
  log.record('b', 'Multiply', true, 0, '3557 × 4289', { text: '15,255,973', tool: 'calculator: 3557 * 4289 = 15255973', tokens: 9 });

  const md = readFileSync(join(dir, 'coach', 'CHAT.md'), 'utf8');
  expect(md).toContain('## 1. How many s');
  expect(md).toContain('**AI** (attempt 1 of 2, 3 tokens):\n\n4\n');
  expect(md).toContain('**AI** (attempt 2 of 2, 200 tokens):');
  expect(md.match(/word/g)).toHaveLength(200);
  expect(Math.max(...md.split('\n').map((l) => l.length))).toBeLessThanOrEqual(80);
  expect(md).toContain('## 2. Multiply (calculator on)');
  expect(md).toContain('`calculator: 3557 * 4289 = 15255973`\n\n15,255,973');

  // Survives a restart.
  expect(new ChatLog(join(dir, 'data')).get('a')?.turns[0].attempts).toHaveLength(2);
});

test('wrapping keeps line breaks and hangs list items', () => {
  expect(wrap('one\n\ntwo')).toBe('one\n\ntwo');
  expect(wrap('- ' + 'ab '.repeat(30).trim(), 20).split('\n')).toEqual([
    '- ab ab ab ab ab ab',
    ...Array(4).fill('  ab ab ab ab ab ab'),
  ]);
  expect(wrap('a'.repeat(100), 20)).toBe('a'.repeat(100));
});
