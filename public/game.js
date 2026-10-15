import { TikTokGameClient } from './tiktok-game-client.js';

const element = (id) => document.getElementById(id);
let blue = 0;
let red = 0;
let energy = 0;
let totalEvents = 0;

function flash() {
  element('flash').classList.remove('activated');
  void element('flash').offsetWidth;
  element('flash').classList.add('activated');
}

function addEvent(label, description) {
  element('events').querySelector('.empty')?.remove();
  const row = document.createElement('div');
  row.className = 'event';
  const tag = document.createElement('b');
  tag.textContent = label;
  row.append(tag, document.createTextNode(description));
  element('events').prepend(row);
  while (element('events').children.length > 40) element('events').lastElementChild.remove();
  element('event-count').textContent = `${++totalEvents} eventos`;
}

function gameEvent(event) {
  const viewer = event.user?.nickname || 'Visitante';
  const count = event.count || 1;
  switch (event.type) {
    case 'chat': {
      const command = event.text.trim().toLowerCase();
      if (command === '!azul' || command === 'azul') blue += 1;
      if (command === '!vermelho' || command === 'vermelho') red += 1;
      addEvent('CHAT', `${viewer}: ${event.text}`);
      break;
    }
    case 'gift':
      blue += count * 10;
      flash();
      addEvent('PRESENTE', `${viewer} enviou ${event.giftName} x${count} (+${count * 10} pontos azul)`);
      break;
    case 'like':
      energy += count;
      if (energy >= 100) { red += Math.floor(energy / 100) * 5; energy %= 100; flash(); }
      addEvent('CURTIDAS', `${viewer}: +${count} curtidas`);
      break;
    case 'follow':
      red += 5;
      addEvent('SEGUIU', `${viewer} começou a seguir (+5 vermelho)`);
      break;
    case 'join': addEvent('ENTROU', `${viewer} entrou na LIVE`); break;
    case 'share': addEvent('COMPARTILHOU', `${viewer} compartilhou a LIVE`); break;
    case 'subscribe': addEvent('INSCRIÇÃO', `${viewer} se inscreveu`); break;
    case 'viewer_count': addEvent('AUDIÊNCIA', `${count} pessoas assistindo`); break;
    default: addEvent(event.type.toUpperCase(), `${viewer} interagiu`);
  }
  element('blue-score').textContent = blue;
  element('red-score').textContent = red;
  element('energy').textContent = energy;
  element('energy-bar').style.width = `${energy}%`;
}

const client = new TikTokGameClient({
  onEvent: gameEvent,
  onStatus: (status) => {
    const descriptions = { demo: 'MODO DEMO · TESTES ATIVOS', connected: 'LIVE CONECTADA', connecting: 'Conectando ao TikTok...', offline: 'LIVE OFFLINE', disconnected: 'Desconectado' };
    element('connection').textContent = `${descriptions[status.state] || status.state}${status.username ? ` · @${status.username}` : ''}`;
    element('mode-hint').textContent = status.mode === 'demo'
      ? 'Teste eventos abaixo. Configure TIKTOK_USERNAME no .env para conectar a sua live.'
      : status.message || 'Os presentes, comentarios e curtidas entram em tempo real.';
    for (const button of document.querySelectorAll('[data-demo]')) button.disabled = status.mode !== 'demo';
  }
});

for (const button of document.querySelectorAll('[data-demo]')) {
  button.addEventListener('click', () => client.sendDemo(button.dataset.demo));
}
client.connect();
window.addEventListener('beforeunload', () => client.close());
