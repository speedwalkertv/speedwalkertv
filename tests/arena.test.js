import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../public/npc/engine.js';

const viewer = (type, extras = {}) => ({
  type,
  user: { id: 'jogador-a', username: 'jogador_a', nickname: 'Apoiador A' },
  ...extras
});

test('o NPC joga autonomamente, causa dano e se move sem comandos', () => {
  const arena = new Arena();
  const before = { x: arena.hero.x, y: arena.hero.y };
  for (let i = 0; i < 800; i++) arena.update(.016);
  assert.ok(arena.t > 11);
  assert.ok(arena.hero.x !== before.x || arena.hero.y !== before.y);
  assert.ok(arena.kills > 0);
  assert.ok(Number.isFinite(arena.hero.hp));
  assert.ok(Number.isFinite(arena.score));
});

test('presentes acionam tiers, falas, recuperação e habilidades', () => {
  const arena = new Arena();
  arena.hero.hp = 50;
  arena.interact(viewer('gift', {giftName:'Rosa', count:1, diamondsEach:1}));
  assert.ok(arena.hero.hp > 50);
  assert.match(arena.heroLine, /Apoiador/);
  arena.interact(viewer('gift', {giftName:'Rosquinha', count:1, diamondsEach:30}));
  assert.ok(arena.hero.shield > 0);
  assert.equal(arena.callout.title, 'MODO BERSERK');
  arena.interact(viewer('gift', {giftName:'Cometa', count:1, diamondsEach:150}));
  assert.equal(arena.callout.title, 'CHUVA DE METEOROS');
  arena.interact(viewer('gift', {giftName:'Galáxia', count:1, diamondsEach:1000}));
  assert.equal(arena.callout.title, 'PODER DIVINO');
  assert.ok(arena.hero.hp > 0);
  assert.ok(arena.support.get('Apoiador A') >= 1000);
});

test('comentários gratuitos funcionam e respeitam cooldown', () => {
  const arena = new Arena();
  const h = arena.hero;
  h.hp = 30;
  arena.interact(viewer('chat', {text:'!cura'}));
  assert.ok(h.hp >= 64);
  const firstValue = h.hp;
  arena.interact(viewer('chat', {text:'!cura'}));
  assert.equal(h.hp, firstValue);
  arena.t = 10;
  arena.interact(viewer('chat', {text:'!escudo'}));
  assert.ok(h.shield >= 40);
});

test('curtidas, seguidores e compartilhamentos geram reações sem compra', () => {
  const arena = new Arena();
  arena.interact(viewer('like', {count:100}));
  assert.ok(arena.effects.length > 0);
  arena.interact(viewer('follow'));
  assert.equal(arena.allies.length, 1);
  arena.interact(viewer('share'));
  assert.match(arena.heroLine, /compartilhar/i);
});

test('partida recomeça sem intervenção, mantendo ranking de apoiadores', () => {
  const arena = new Arena();
  arena.interact(viewer('gift', {count:1,diamondsEach:1}));
  arena.hero.hp = -1;
  arena.update(.016);
  assert.equal(arena.phase, 'dead');
  for (let i = 0; i < 110; i++) arena.update(.05);
  assert.equal(arena.phase, 'combat');
  assert.equal(arena.runs, 1);
  assert.equal(arena.wave, 1);
  assert.ok(arena.support.has('Apoiador A'));
});
