import 'dotenv/config';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { normalizeEvent } from './normalize.js';
import { createJevHandler } from './jev.js';
import { createVoiceHandler } from './voice.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const username = (process.env.TIKTOK_USERNAME ?? '').trim().replace(/^@/, '');
if (username && !/^[\w.]{2,40}$/.test(username)) throw new Error('TIKTOK_USERNAME invalido');
const mode = username ? 'live' : 'demo';
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const port = Number(process.env.PORT ?? 8787);
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp' };
const publicDir = path.join(root, 'public');

let status = { state: mode === 'demo' ? 'demo' : 'connecting', mode, username, roomId: null, message: '' };
let liveConnection = null;
let stopped = false;
let retryTimer = null;
let retries = 0;
const handleJev=createJevHandler();
const handleVoice=createVoiceHandler();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if(await handleJev(req,res,url))return;
  if(await handleVoice(req,res,url))return;
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/npc/' }).end();
    return;
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, ...status }));
    return;
  }
  const paths = {
    '/index.html': 'index.html', '/game.js': 'game.js',
    '/tiktok-game-client.js': 'tiktok-game-client.js', '/style.css': 'style.css',
    '/npc': 'npc/index.html', '/npc/': 'npc/index.html',
    '/npc/index.html': 'npc/index.html', '/npc/main.js': 'npc/main.js',
    '/npc/engine.js': 'npc/engine.js', '/npc/draw.js': 'npc/draw.js',
    '/npc/vfx.js':'npc/vfx.js', '/npc/combat-ai.js':'npc/combat-ai.js',
    '/npc/jev-client.js':'npc/jev-client.js', '/npc/jev-memory.js':'npc/jev-memory.js',
    '/npc/jev-folder.js':'npc/jev-folder.js',
    '/npc/memory':'npc/memory/index.html', '/npc/memory/':'npc/memory/index.html',
    '/npc/memory/index.html':'npc/memory/index.html',
    '/npc/memory/main.js':'npc/memory/main.js',
    '/npc/memory/style.css':'npc/memory/style.css',
    '/npc/style.css': 'npc/style.css',
    ...Object.fromEntries(['eclipse-arena','kaito','kaito-attack','kaito-windup','kaito-swing','slime','hunter','tank','boss',
      ...Array.from({length:6},(_,i)=>`kaito-run-${i}`),
      ...['hunter','tank','boss'].flatMap(type=>Array.from({length:3},(_,i)=>`${type}-motion-${i}`))].map(name =>
      [`/npc/assets/${name}.webp`, `npc/assets/${name}.webp`]))
  };
  const file = paths[url.pathname];
  if (!file) { res.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(path.join(publicDir, file));
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)], 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch (error) {
    console.error('Erro de arquivo:', error.message);
    res.writeHead(500).end('Internal error');
  }
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 4096
});

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  let allowed = !origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      allowed = (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.host === request.headers.host;
    } catch { allowed = false; }
  }
  if (request.url !== '/ws' || !allowed) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

function send(ws, packet) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1_000_000) ws.send(JSON.stringify(packet));
}

function broadcast(packet) {
  for (const client of wss.clients) send(client, packet);
}

function setStatus(state, message = '', roomId = status.roomId) {
  status = { state, mode, username, roomId, message: String(message).slice(0, 300) };
  broadcast({ kind: 'status', ...status });
  console.log(`[TikTok ${mode}] ${state}${message ? ': ' + message : ''}`);
}

function publish(type, raw, source) {
  const event = normalizeEvent(type, raw);
  if (event) broadcast({ kind: 'event', event: { ...event, source } });
  return event;
}

const demos = {
  chat: (data) => ({ user: { uniqueId: 'jogador123', nickname: 'Jogador 123' }, comment: typeof data.text === 'string' ? data.text.slice(0, 80) : '!fogo' }),
  gift: (data) => {
    const gifts = {
      rose: { id: 5655, name: 'Rosa', diamonds: 1 },
      donut: { id: 5879, name: 'Rosquinha', diamonds: 30 },
      meteor: { id: 6104, name: 'Cometa', diamonds: 150 },
      galaxy: { id: 10000, name: 'Galaxia', diamonds: 1000 }
    };
    const gift = gifts[data.gift] || gifts.rose;
    return { user: { uniqueId: 'presente123', nickname: 'Presenteiro' }, giftId: gift.id, giftDetails: { giftName: gift.name, giftType: 0, diamondCount: gift.diamonds }, repeatCount: 1 };
  },
  like: () => ({ user: { uniqueId: 'like123', nickname: 'Curtiu' }, likeCount: 25, totalLikeCount: 100 }),
  follow: () => ({ user: { uniqueId: 'seguidor123', nickname: 'Novo seguidor' } }),
  share: () => ({ user: { uniqueId: 'compartilha123', nickname: 'Compartilhou' } }),
  join: () => ({ user: { uniqueId: 'novo123', nickname: 'Novo jogador' } }),
  subscribe: () => ({ user: { uniqueId: 'sub123', nickname: 'Inscrito' } })
};

wss.on('connection', (ws) => {
  send(ws, { kind: 'status', ...status });
  ws.on('message', (message) => {
    if (message.length < 100 && String(message) === '{"kind":"heartbeat"}') return;
    if (mode !== 'demo') return; // Nunca simular evento monetizado em uma live real.
    let data;
    try { data = JSON.parse(String(message)); } catch { return; }
    if (data?.kind === 'simulate' && Object.hasOwn(demos, data.type)) {
      publish(data.type, demos[data.type](data), 'demo');
    }
  });
});

function scheduleRetry(delay) {
  if (retryTimer || stopped) return;
  retryTimer = setTimeout(() => { retryTimer = null; connectLive(); }, delay);
  retryTimer.unref();
}

async function connectLive() {
  if (stopped || mode !== 'live') return;
  const current = new TikTokLiveConnection(username, {
    processInitialData: false, // nao dispara comandos antigos ao reiniciar o jogo
    enableExtendedGiftInfo: true,
    ...(process.env.TIKTOK_SIGN_API_KEY ? { signApiKey: process.env.TIKTOK_SIGN_API_KEY } : {})
  });
  liveConnection = current;
  const events = [
    [WebcastEvent.CHAT, 'chat'], [WebcastEvent.GIFT, 'gift'],
    [WebcastEvent.LIKE, 'like'], [WebcastEvent.FOLLOW, 'follow'],
    [WebcastEvent.SHARE, 'share'], [WebcastEvent.MEMBER, 'join'],
    [WebcastEvent.ROOM_USER, 'viewer_count'],
    [WebcastEvent.SUBSCRIBE, 'subscribe'], [WebcastEvent.QUESTION_NEW, 'question']
  ];
  for (const [wire, kind] of events) {
    current.on(wire, (raw) => { if (current === liveConnection && !stopped) publish(kind, raw, 'tiktok'); });
  }
  current.on(ControlEvent.DISCONNECTED, () => {
    if (current !== liveConnection || stopped) return;
    setStatus('disconnected', 'Reconectando automaticamente...');
    scheduleRetry(Math.min(60_000, 5000 * (2 ** Math.min(retries++, 4))));
  });
  current.on(ControlEvent.ERROR, (err) => {
    if (current === liveConnection) console.error('TikTok erro:', String(err?.info ?? err?.message ?? 'Erro de conexao').slice(0, 180));
  });
  current.on(WebcastEvent.STREAM_END, () => {
    if (current !== liveConnection || stopped) return;
    setStatus('offline', 'A live terminou. Aguardando nova transmissao...');
    scheduleRetry(60_000);
  });
  setStatus('connecting', `Conectando a @${username}...`, null);
  try {
    const state = await current.connect();
    if (stopped || liveConnection !== current) { await current.disconnect(); return; }
    retries = 0;
    setStatus('connected', 'Recebendo eventos reais da LIVE', String(state.roomId ?? ''));
  } catch (error) {
    if (stopped || liveConnection !== current) return;
    const message = String(error?.message ?? error).slice(0, 180);
    setStatus('offline', `${message}; nova tentativa automatica`);
    scheduleRetry(Math.min(60_000, 5000 * (2 ** Math.min(retries++, 4))));
  }
}

server.listen(port, host, () => {
  console.log(`TikTok LIVE Game Bridge: http://${host}:${server.address().port} (${mode})`);
  if (mode === 'live') void connectLive();
});

async function shutdown() {
  stopped = true;
  clearTimeout(retryTimer);
  if (liveConnection) await liveConnection.disconnect().catch(() => {});
  wss.close();
  server.close();
}
process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
