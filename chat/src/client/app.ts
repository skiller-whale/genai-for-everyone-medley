import { Marked } from 'marked';
import type { ChatRequest, ReplyEvent, Turn } from '../shared/types';

// A plain chat app. Chats live in the browser; the server streams replies and
// keeps the coach's log. Nothing here judges whether an answer is right.

interface Version {
  text: string;
  tokens?: number;
  tool?: string;
  error?: string;
  done: boolean;
}
type Msg = { role: 'user'; text: string } | { role: 'assistant'; versions: Version[]; v: number };
interface Chat {
  id: string;
  title: string;
  tools: boolean;
  msgs: Msg[];
}
interface Config {
  title: string;
  welcome: string;
  footer: string;
  footerWithTools: string;
  tools: boolean;
  suggestions: { title: string; prompt: string }[];
}

const STORE = 'sw-chat';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>('input');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const marked = new Marked({ gfm: true, breaks: true, renderer: { html: ({ text }) => escapeHtml(text) } });

let config: Config;
let chats: Chat[] = load();
let active: Chat;
let streaming: AbortController | null = null;
/** The link decides whether tools are offered: /?tools or /tools. */
let toolsLink = false;

function load(): Chat[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    // A reply cut off by a reload is finished as it stands.
    for (const c of saved) for (const m of c.msgs) if (m.role === 'assistant') for (const v of m.versions) v.done = true;
    return saved;
  } catch {
    return [];
  }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(chats.filter((c) => c.msgs.length)));
  } catch {}
}
const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function newChat() {
  if (streaming) return;
  if (active && !active.msgs.length) return input.focus();
  active = { id: newId(), title: 'New chat', tools: toolsLink, msgs: [] };
  chats.unshift(active);
  input.value = '';
  renderAll();
  input.focus();
}
function open(chat: Chat) {
  if (streaming || chat === active) return;
  chats = chats.filter((c) => c.msgs.length || c === chat);
  active = chat;
  input.value = '';
  renderAll();
}

function renderAll() {
  renderSide();
  renderThread();
  syncComposer();
}

function renderSide() {
  const list = $('convlist');
  const sel = $<HTMLSelectElement>('mobsel');
  list.textContent = '';
  sel.textContent = '';
  const shown = chats.filter((c) => c.msgs.length || c === active);
  for (const c of shown) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'conv' + (c === active ? ' on' : '');
    b.textContent = c.title;
    b.title = c.title;
    if (c === active) b.setAttribute('aria-current', 'true');
    if (c.tools && c.msgs.length) {
      const t = document.createElement('span');
      t.className = 'tl';
      t.textContent = '· calculator';
      b.appendChild(t);
    }
    b.addEventListener('click', () => open(c));
    list.appendChild(b);
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.title;
    o.selected = c === active;
    sel.appendChild(o);
  }
  if (!shown.length) list.innerHTML = '<div class="none">No chats yet</div>';
}

function renderThread() {
  const th = $('thread');
  th.textContent = '';
  if (!active.msgs.length) {
    const w = document.createElement('div');
    w.className = 'welcome';
    const h = document.createElement('h1');
    h.textContent = config.welcome;
    w.appendChild(h);
    if (config.suggestions.length) {
      const box = document.createElement('div');
      box.className = 'sugs';
      for (const s of config.suggestions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sug';
        b.innerHTML = '<span class="t"></span><span class="p"></span>';
        b.querySelector('.t')!.textContent = s.title;
        b.querySelector('.p')!.textContent = s.prompt;
        b.addEventListener('click', () => {
          input.value = s.prompt;
          syncComposer();
          input.focus();
        });
        box.appendChild(b);
      }
      w.appendChild(box);
    }
    th.appendChild(w);
    return;
  }
  active.msgs.forEach((m, i) => th.appendChild(msgEl(m, i === active.msgs.length - 1)));
  th.scrollTop = th.scrollHeight;
}

function bodyHtml(v: Version): string {
  const html = v.text ? marked.parse(v.text, { async: false }) : '';
  return html + (v.error ? `<p class="err">${escapeHtml(v.error)}</p>` : '');
}

function msgEl(m: Msg, last: boolean): HTMLElement {
  const d = document.createElement('div');
  if (m.role === 'user') {
    d.className = 'msg user';
    d.textContent = m.text;
    return d;
  }
  d.className = 'msg ai';
  d.innerHTML = '<span class="av" aria-hidden="true">AI</span><div><div class="body"></div><div class="meta"></div></div>';
  const cur = m.versions[m.v];
  const body = d.querySelector<HTMLElement>('.body')!;
  body.innerHTML = bodyHtml(cur);
  if (!cur.done) body.classList.add('cursor');
  if (cur.tool) {
    for (const line of cur.tool.split('; ')) {
      const chip = document.createElement('div');
      chip.className = 'toolchip';
      chip.textContent = line;
      body.before(chip);
    }
  }
  const meta = d.querySelector<HTMLElement>('.meta')!;
  const btn = (label: string, fn: () => void, title?: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ico';
    b.textContent = label;
    if (title) {
      b.title = title;
      b.setAttribute('aria-label', title);
    }
    b.addEventListener('click', fn);
    meta.appendChild(b);
    return b;
  };
  if (m.versions.length > 1) {
    const flip = (to: number) => {
      if (streaming) return;
      m.v = to;
      save();
      renderThread();
    };
    btn('‹', () => flip(Math.max(0, m.v - 1)), 'Previous attempt').disabled = m.v === 0 || !!streaming;
    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.textContent = `${m.v + 1} / ${m.versions.length}`;
    meta.appendChild(pos);
    btn('›', () => flip(Math.min(m.versions.length - 1, m.v + 1)), 'Next attempt').disabled =
      m.v === m.versions.length - 1 || !!streaming;
  }
  if (cur.done) {
    const cp = btn('Copy', () => {
      navigator.clipboard?.writeText(cur.text).then(() => (cp.textContent = 'Copied'), () => {});
    });
    if (last) btn('Try again', () => reply(m), 'Get a new answer to the same message');
    if (cur.tokens !== undefined) {
      const tk = document.createElement('span');
      tk.className = 'tok';
      tk.textContent = `${cur.tokens} tokens`;
      meta.appendChild(tk);
    }
  } else {
    btn('Stop', () => streaming?.abort());
  }
  return d;
}

function syncComposer() {
  $<HTMLButtonElement>('send').disabled = !!streaming || !input.value.trim();
  const t = $('tools');
  t.hidden = !toolsLink || active.msgs.length > 0;
  t.setAttribute('aria-pressed', String(active.tools));
  $('hint').textContent = active.tools ? config.footerWithTools : config.footer;
}

/** The conversation up to `upto` (exclusive), as the model sees it. */
function history(chat: Chat, upto: number): Turn[] {
  return chat.msgs.slice(0, upto).map((m) =>
    m.role === 'user' ? { role: 'user', text: m.text } : { role: 'assistant', text: m.versions[m.v].text || '(no reply)' },
  );
}

function send(text: string) {
  if (streaming || !text.trim()) return;
  if (!active.msgs.length) active.title = text.replace(/\s+/g, ' ').trim().slice(0, 40);
  active.msgs.push({ role: 'user', text });
  const m: Msg = { role: 'assistant', versions: [], v: 0 };
  active.msgs.push(m);
  input.value = '';
  reply(m);
}

/** Streams a new attempt into `m`. Every attempt gets the same history, never the earlier attempts. */
async function reply(m: Msg & { role: 'assistant' }) {
  if (streaming) return;
  const chat = active;
  const at = chat.msgs.indexOf(m);
  const ver: Version = { text: '', done: false };
  m.versions.push(ver);
  m.v = m.versions.length - 1;
  streaming = new AbortController();
  save();
  renderAll();

  const body = () => (chat === active ? $('thread').querySelector<HTMLElement>('.msg.ai:last-child .body') : null);
  const request: ChatRequest = { chatId: chat.id, title: chat.title, tools: chat.tools, history: history(chat, at) };
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: streaming.signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      let toolSeen = false;
      for (const line of lines) {
        if (!line) continue;
        const ev = JSON.parse(line) as ReplyEvent;
        if (ev.type === 'text') ver.text += ev.text;
        else if (ev.type === 'tool') {
          ver.tool = ver.tool ? `${ver.tool}; ${ev.text}` : ev.text;
          toolSeen = true;
        } else if (ev.type === 'done') ver.tokens = ev.tokens;
        else if (ev.type === 'error') ver.error = ev.message;
      }
      if (toolSeen) renderThread();
      const b = body();
      if (b) {
        b.innerHTML = bodyHtml(ver);
        const th = $('thread');
        th.scrollTop = th.scrollHeight;
      }
    }
  } catch (err) {
    if (!streaming?.signal.aborted) ver.error = `Couldn't get a reply (${err instanceof Error ? err.message : err}). Try again.`;
  }
  ver.done = true;
  streaming = null;
  save();
  renderAll();
}

input.addEventListener('input', syncComposer);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send(input.value);
  }
});
$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});
$('newchat').addEventListener('click', newChat);
$('mobnew').addEventListener('click', newChat);
$('mobsel').addEventListener('change', (e) => {
  const c = chats.find((x) => x.id === (e.target as HTMLSelectElement).value);
  if (c) open(c);
});
$('tools').addEventListener('click', () => {
  if (streaming || active.msgs.length) return;
  active.tools = !active.tools;
  syncComposer();
});

(async () => {
  config = await fetch('/api/config').then((r) => r.json());
  document.title = config.title;
  $('brand').textContent = config.title;
  toolsLink = config.tools && (new URLSearchParams(location.search).has('tools') || /\/tools\/?$/.test(location.pathname));
  newChat();
})();
