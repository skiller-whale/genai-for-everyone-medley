import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatLog } from './log';

test('the coach sees every attempt, in order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-'));
  const log = new ChatLog(join(dir, 'data'), join(dir, 'coach'));
  log.record('a', 'How many s', false, 0, 'How many s?', { text: '4', tokens: 3 });
  log.record('a', 'How many s', false, 0, 'How many s?', { text: '5', tokens: 3 });
  log.record('b', 'Multiply', true, 0, '3557 × 4289', { text: '15,255,973', tool: 'calculator: 3557 * 4289 = 15255973', tokens: 9 });

  const md = readFileSync(join(dir, 'coach', 'CHAT.md'), 'utf8');
  expect(md).toContain('## 1. How many s');
  expect(md).toContain('- attempt 1: 4');
  expect(md).toContain('- attempt 2: 5');
  expect(md).toContain('## 2. Multiply (calculator on)');
  expect(md).toContain('[calculator: 3557 * 4289 = 15255973] 15,255,973');

  // Survives a restart.
  expect(new ChatLog(join(dir, 'data')).get('a')?.turns[0].attempts).toHaveLength(2);
});
