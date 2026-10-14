import { TikTokGameClient } from '../tiktok-game-client.js';
import { JevPilot } from './jev-client.js';
import { Arena } from './engine.js';
import { draw } from './draw.js';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d', { alpha: false });
const game = new Arena();
const pilot = new JevPilot(game, info => {
  $('jev-status').textContent=info.text;
  $('jev-mode').textContent=info.state==='active'?'API ATIVA':'PILOTO LOCAL';
  $('jev-detail').textContent=info.model ? info.model+' · '+info.latencyMs+' ms' : '';
  $('jev-connect').disabled=!pilot.config?.ready;
});
$('jev-form').addEventListener('submit',event=>{event.preventDefault();pilot.start($('jev-token').value.trim());$('jev-token').value='';});
$('jev-stop').addEventListener('click',()=>pilot.stop());
pilot.init();
const params = new URLSearchParams(location.search);
if (params.get('overlay') === '1') document.body.classList.add('overlay');

let status = { mode: 'demo', state: 'connecting', username: '' };
let uiTimer = 0;
let renderedEntry = -1;
let lastVoiceText = '';
let lastVoiceTime = -10;
let totalEvents = 0;
let voiceEnabled = localStorage.getItem('npc-chaos-voice') === 'yes';
let currentUtterance = null;
let reducedEffects = localStorage.getItem('npc-chaos-effects') === 'reduced' ||
  (localStorage.getItem('npc-chaos-effects') === null && matchMedia('(prefers-reduced-motion: reduce)').matches);
const renderMetrics={frames:0,totalMs:0,maxMs:0};
function updateEffectsButton(){
  $('effects-toggle').textContent=reducedEffects?'Efeitos: suaves':'Efeitos: completos';
  $('effects-toggle').setAttribute('aria-pressed',String(reducedEffects));
}
$('effects-toggle').addEventListener('click',()=>{
  reducedEffects=!reducedEffects;
  localStorage.setItem('npc-chaos-effects',reducedEffects?'reduced':'full');
  updateEffectsButton();
});
updateEffectsButton();

function voiceSay(text) {
  if (!voiceEnabled || !('speechSynthesis' in window) || !text) return;
  if (text === lastVoiceText && game.t - lastVoiceTime < 3) return;
  lastVoiceText = text;
  lastVoiceTime = game.t;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 1.12;
  utterance.pitch = 1.02;
  utterance.volume = .8;
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang === 'pt-BR' && /natural|online/i.test(v.name)) ||
    voices.find(v => v.lang === 'pt-BR') || voices.find(v => v.lang.startsWith('pt'));
  if (preferred) utterance.voice = preferred;
  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
}

function updateVoiceButton() {
  $('sound-toggle').textContent = voiceEnabled ? '♫ Voz: ligada' : '♫ Voz: desligada';
}

$('sound-toggle').addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('npc-chaos-voice', voiceEnabled ? 'yes' : 'no');
  if (!voiceEnabled) speechSynthesis.cancel();
  else voiceSay('Olá, chat! Eu sou Kaito, seu herói!');
  updateVoiceButton();
});
updateVoiceButton();

$('fullscreen').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await $('stage').requestFullscreen();
});

const icons = { gift: '✿', chat: '⌘', follow: '♞', like: '♥', share: '➤', join: '↳', subscribe: '★', system: '✦', question: '?' };
function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function showEntries() {
  if (!game.entries.length || renderedEntry === game.entries[0].id) return;
  renderedEntry = game.entries[0].id;
  $('last-event').textContent = game.entries[0].name + ': ' + game.entries[0].message;
  const items = game.entries.slice(0, 8);
  const fragment = document.createDocumentFragment();
  for (const entry of items) {
    const row = make('div', 'activity ' + entry.type);
    row.append(make('div', 'activity-icon', icons[entry.type] || '✧'));
    const text = make('div', 'activity-text');
    text.append(make('strong', '', entry.name), make('span', '', entry.message));
    row.append(text);
    fragment.append(row);
  }
  $('activity-list').replaceChildren(fragment);
  const leaders = [...game.support.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!leaders.length) return;
  const list = document.createDocumentFragment();
  leaders.forEach(([name, score], index) => {
    const row = make('div', 'support-row');
    row.append(make('span', '', String(index + 1).padStart(2, '0') + '   ' + name), make('b', '', score.toLocaleString('pt-BR')));
    list.append(row);
  });
  $('support-list').replaceChildren(list);
}

function updateHUD() {
  if(pilot.enabled && (!game.agentDecision || game.agentDecision.expiresAt<=game.t)) $('jev-mode').textContent='PILOTO LOCAL';
  const h = game.hero;
  $('hero-level').textContent = 'LVL ' + h.level;
  $('hero-hp').textContent = Math.max(0, Math.ceil(h.hp)) + ' / ' + h.maxHp;
  $('hp-fill').style.width = Math.max(0, 100 * h.hp / h.maxHp) + '%';
  $('xp-fill').style.width = Math.min(100, 100 * h.xp / h.xpNext) + '%';
  $('shield-label').textContent = 'ESCUDO ' + Math.round(h.shield);
  $('wave').textContent = String(game.wave).padStart(2, '0');
  $('kills').textContent = String(game.kills).padStart(3, '0');
  $('score').textContent = game.score.toLocaleString('pt-BR');
  $('power-value').textContent = Math.min(game.likeCharge, 100) + ' / 100';
  $('power-fill').style.width = Math.min(game.likeCharge, 100) + '%';
  const showCombo = game.combo >= 2 && game.t - game.lastKillAt < 2.7;
  $('combo').style.opacity = showCombo ? '1' : '0';
  $('combo-value').textContent = game.combo;
  $('battle-callout').style.opacity = game.callout && game.callout.ttl > 0 ? '1' : '0';
  if (game.callout) {
    $('callout-title').textContent = game.callout.title;
    $('callout-caption').textContent = game.callout.caption;
    $('callout-title').style.color = game.callout.color;
  }
  $('speech').style.opacity = game.lineTtl > 0 && game.phase === 'combat' ? '1' : '0';
  $('speech-line').textContent = game.heroLine;
  if (game.lineTtl > 2.5 && lastVoiceText !== game.heroLine) voiceSay(game.heroLine);
  showEntries();
}

function onStatus(next) {
  status = next;
  const names = {
    demo: 'DEMONSTRAÇÃO',
    connected: 'LIVE CONECTADA',
    connecting: 'CONECTANDO',
    disconnected: 'RECONECTANDO',
    offline: 'LIVE OFFLINE'
  };
  const label = names[next.state] || next.state.toUpperCase();
  $('live-state').textContent = label;
  $('stage-status').textContent = next.state === 'demo' ? 'DEMO' : next.state === 'connected' ? 'AO VIVO' : 'OFFLINE';
  $('control-mode').textContent = next.state === 'connected' ? 'Recebendo a live @' + next.username : label;
  $('control-description').textContent = next.mode === 'demo'
    ? 'O herói joga sozinho. Use os botões para simular o público.'
    : next.message || 'Tentando reconectar automaticamente ao TikTok.';
  $('demo-panel').style.display = next.mode === 'demo' ? '' : 'none';
  for (const btn of document.querySelectorAll('[data-test]')) btn.disabled = next.mode !== 'demo';
}

function onEvent(event) {
  if (!event || !event.type) return;
  totalEvents++;
  $('event-total').textContent = String(totalEvents);
  game.interact(event);
  updateHUD();
}

const bridge = new TikTokGameClient({ onStatus, onEvent });
bridge.connect();

for (const button of document.querySelectorAll('[data-test]')) {
  button.addEventListener('click', () => bridge.sendDemo(button.dataset.test, {
    text: button.dataset.text, gift: button.dataset.gift
  }));
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min((now - prev) / 1000, .05);
  prev = now;
  game.update(dt);
  const renderStart=performance.now();
  draw(ctx, game, {reduced:reducedEffects});
  const renderMs=performance.now()-renderStart;
  renderMetrics.frames++;renderMetrics.totalMs+=renderMs;renderMetrics.maxMs=Math.max(renderMetrics.maxMs,renderMs);
  uiTimer += dt;
  if (uiTimer > .1) {
    uiTimer = 0;
    updateHUD();
  }
  requestAnimationFrame(frame);
}
onStatus(status);
updateHUD();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => { prev = performance.now(); });
window.addEventListener('beforeunload', () => {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  pilot.stop(false);
  bridge.close();
});
// Inspecionavel em Playwright e no console, sem controles obrigatorios para jogar.
window.NPC_CHAOS = { game, renderMetrics, getStatus: () => status, test: (type, options = {}) => bridge.sendDemo(type, options) };
