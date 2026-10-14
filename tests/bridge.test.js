import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import WebSocket from 'ws';
import { normalizeEvent } from '../src/normalize.js';

test('presentes com streak so ativam jogo apos conclusao e contam uma vez', () => {
  const data = { user: { uniqueId: 'joao', nickname: 'Joao' }, giftId: 5655, repeatCount: 5, giftDetails: { giftType: 1, giftName: 'Rosa' } };
  assert.equal(normalizeEvent('gift', { ...data, repeatEnd: false }), null);
  const gift = normalizeEvent('gift', { ...data, repeatEnd: true });
  assert.equal(gift.count, 5);
  assert.equal(gift.giftName, 'Rosa');
  assert.equal(gift.user.username, 'joao');
  assert.equal(normalizeEvent('gift', { ...data, giftDetails: { giftType: 0 }, repeatEnd: false }).count, 5);
});

test('curtidas, comentario e usuarios sao normalizados e limitados', () => {
  assert.equal(normalizeEvent('like', { user: { uniqueId: 'ana' }, likeCount: 24 }).count, 24);
  assert.equal(normalizeEvent('chat', { comment: 'a'.repeat(999) }).text.length, 250);
  assert.equal(normalizeEvent('viewer_count', { viewerCount: '123' }).count, 123);
  assert.equal(normalizeEvent('desconhecido'), null);
});

test('servidor demo responde HTTP e entrega comentarios, presentes e curtidas via WebSocket', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: root,
    env: { ...process.env, TIKTOK_USERNAME: '', PORT: '0', HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (buffer) => { stdout += buffer; });
  child.stderr.on('data', (buffer) => { stderr += buffer; });
  let ws;
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Servidor nao iniciou: ${stdout} ${stderr}`)), 15000);
      const scan = () => {
        const found = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (found) { clearTimeout(timeout); resolve(Number(found[1])); }
      };
      child.stdout.on('data', scan);
      child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`Servidor saiu: ${code}, ${stderr}`)); });
      scan();
    });
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(health.state, 'demo');
    const webpage = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(webpage, /NPC CHAOS/);
    const bridgeDemo = await (await fetch(`http://127.0.0.1:${port}/index.html`)).text();
    assert.match(bridgeDemo, /GAME BRIDGE/);
    ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const packets = [];
    ws.on('message', (message) => packets.push(JSON.parse(String(message))));
    await once(ws, 'open');
    for (const type of ['chat', 'gift', 'like', 'follow', 'share', 'join']) {
      ws.send(JSON.stringify({ kind: 'simulate', type }));
    }
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Nao chegaram os 6 eventos: ${JSON.stringify(packets)}`)), 5000);
      const timer = setInterval(() => {
        if (packets.filter((packet) => packet.kind === 'event').length === 6) {
          clearInterval(timer);
          clearTimeout(timeout);
          resolve();
        }
      }, 20);
    });
    const types = packets.filter((packet) => packet.kind === 'event').map((packet) => packet.event.type);
    assert.deepEqual(types, ['chat', 'gift', 'like', 'follow', 'share', 'join']);
    assert.ok(packets.every((packet) => packet.kind !== 'event' || packet.event.source === 'demo'));
  } finally {
    ws?.close();
    child.kill();
  }
});
