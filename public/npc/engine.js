// Simulacao independente do navegador: combate, NPC automatico e efeitos das LIVE.
import { intercept, selectTarget, segmentCircleHit } from './combat-ai.js';
export const WIDTH = 720;
export const HEIGHT = 1280;
const LIMITS = { left: 67, right: 653, top: 405, bottom: 1150 };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const random = (a, b) => a + Math.random() * (b - a);
const colors = { slime: '#62e4df', hunter: '#ff5586', tank: '#b086ff', boss: '#ffa64e' };

export class Arena {
  constructor() {
    this.best = 0;
    this.runs = 0;
    this.reset();
  }

  reset() {
    this.t = 0;
    this.wave = 1;
    this.waveTime = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.lastKillAt = 0;
    this.likeCharge = 0;
    this.hero = { x: 360, y: 814, hp: 160, maxHp: 160, shield: 0, level: 1, xp: 0, xpNext: 7, damage: 23, speed: 130, rate: .50, attackClock: .3, hitClock: 0, dashClock: 0, facing: 1 };
    Object.assign(this.hero, { vx: 0, vy: 0, stride: 0, attackPose: 0, attackSerial: 0, aim: 0, trail: [], trailClock: 0 });
    this.visuals = [];
    this.combatStats = { shots:0, hits:0 };
    this.agentDecision = null;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.floaters = [];
    this.allies = [];
    this.effects = [];
    this.flares = [];
    this.support ??= new Map();
    this.chatCooldowns = new Map();
    this.entries = [];
    this.entryId = 0;
    this.entityId = 0;
    this.heroLine = 'Pronto! Quem vai entrar na arena comigo?';
    this.lineTtl = 5;
    this.callout = { title: 'A ARENA ACORDOU', caption: 'O HERÓI LUTA SOZINHO', color: '#57f5dc', ttl: 3 };
    this.phase = 'combat';
    this.afterDeath = 0;
    this.shake = 0;
    this.spawnClock = 1;
    this.bossSummoned = false;
    this.push('system', 'Nova tentativa!', 'O herói entrou na arena.');
    this.spawnEnemy();
    this.spawnEnemy();
  }

  push(type, name, message, value = 0) {
    this.entries.unshift({ id: ++this.entryId, type, name: String(name).slice(0, 36), message: String(message).slice(0, 130), value });
    this.entries.length = Math.min(20, this.entries.length);
  }

  say(line, ttl = 3.7) {
    this.heroLine = line.slice(0, 145);
    this.lineTtl = ttl;
  }

  announce(title, caption, color = '#57f5dc', ttl = 2.9) {
    this.callout = { title, caption, color, ttl };
  }

  sparks(x, y, color, count = 16, power = 1) {
    const room = Math.max(0, 320 - this.particles.length);
    for (let i = 0; i < Math.min(count, room); i++) {
      const theta = Math.random() * Math.PI * 2, spd = random(45, 210) * power;
      const ttl = random(.28, .88);
      this.particles.push({ x, y, vx: Math.cos(theta) * spd, vy: Math.sin(theta) * spd - 35, ttl, max: ttl, size: random(2, 6), color });
    }
  }

  visual(kind, x, y, duration = 1, options = {}) {
    this.visuals.push({ kind, x, y, ttl: duration, max: duration, ...options });
    if (this.visuals.length > 64) this.visuals.splice(0, this.visuals.length - 64);
  }

  float(text, x, y, color = '#fff', size = 23) {
    this.floaters.push({ text, x, y, ttl: 1, color, size });
    this.floaters.length = Math.min(32, this.floaters.length);
  }

  spawnEnemy(type) {
    if (this.enemies.length > 34 || this.phase !== 'combat') return;
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? LIMITS.left : edge === 1 ? LIMITS.right : random(LIMITS.left, LIMITS.right);
    const y = edge === 2 ? LIMITS.top : edge === 3 ? LIMITS.bottom : random(LIMITS.top, LIMITS.bottom);
    type ||= this.wave >= 3 && Math.random() < .24 ? 'tank' : this.wave >= 2 && Math.random() < .40 ? 'hunter' : 'slime';
    const boss = type === 'boss';
    const hp = boss ? 520 + this.wave * 75 : (type === 'tank' ? 105 : type === 'hunter' ? 55 : 42) + this.wave * 12;
    this.enemies.push({ id: ++this.entityId, type, x, y, hp, maxHp: hp, r: boss ? 59 : type === 'tank' ? 27 : 18,
      speed: boss ? 37 : type === 'tank' ? 37 : type === 'hunter' ? 98 : 60,
      damage: boss ? 23 : type === 'tank' ? 18 : 10, attackClock: random(.2, 2.5), a: 0,
      born: .55, hitFlash: 0, stride: 0, moving: false, aim: 0, vx:0, vy:0 });
    this.visual('spawn', x, y, boss ? 1.2 : .65, { color: colors[type], radius: boss ? 120 : 42 });
    if (boss) this.announce('CHEFE INFERNAL', 'PRECISAMOS DE REFORÇOS!', '#ff875d', 4);
  }

  spawnBoss() {
    if (this.bossSummoned) return;
    this.bossSummoned = true;
    this.spawnEnemy('boss');
    this.say('Esse aí é gigante... chat, me ajuda!', 5);
  }

  addSupport(name, points) {
    const key = name.slice(0, 36);
    this.support.set(key, (this.support.get(key) || 0) + points);
    if (this.support.size > 100) {
      const first = this.support.keys().next().value;
      this.support.delete(first);
    }
  }

  pulse(x, y, color, radius = 180, damage = 0) {
    this.effects.push({ x, y, color, radius, ttl: .8, max: .8 });
    this.shake = Math.max(this.shake, damage ? 13 : 5);
    if (damage) {
      for (const enemy of [...this.enemies]) {
        if (distance(enemy, { x, y }) < radius + enemy.r) this.damageEnemy(enemy, damage, true);
      }
    }
    this.sparks(x, y, color, 30, 1.4);
  }

  heal(amount) {
    const h = this.hero;
    h.hp = clamp(h.hp + amount, 0, h.maxHp);
    this.float('+' + Math.round(amount) + ' VIDA', h.x, h.y - 60, '#5cffe2');
    this.sparks(h.x, h.y, '#5cffe2', 22);
    this.visual('heal', h.x, h.y, 1.5, { follow: true });
  }

  gift(event, name) {
    const h = this.hero;
    const each = Number(event.diamondsEach) || 0;
    const count = clamp(Number(event.count) || 1, 1, 100);
    const total = each * count;
    this.addSupport(name, Math.max(1, total) * 10);
    if (total >= 500) {
      this.announce('PODER DIVINO', name.toUpperCase() + ' INVOCOU O CÉU', '#f8d880', 4.2);
      this.say(name + ', você é uma LENDA! Olha isso!', 5);
      this.heal(130);
      h.shield += 120;
      this.pulse(h.x, h.y, '#ffe49b', 1000, 480);
      this.flares.push({ x: h.x, y: h.y, ttl: 1.9, kind: 'god' });
      this.visual('ultimate', h.x, h.y, 2.1);
      this.push('gift', name, 'Invocou PODER DIVINO', Math.max(1, total));
    } else if (total >= 80) {
      this.announce('CHUVA DE METEOROS', name.toUpperCase() + ' ATACOU!', '#ff786d', 3.6);
      this.say('QUE ISSO, ' + name + '! Meteoro neles!', 4.5);
      this.pulse(h.x, h.y, '#ff686c', 420, 185);
      this.flares.push({ x: h.x, y: h.y, ttl: 1.3, kind: 'meteor' });
      this.visual('meteor', h.x, h.y, 1.7);
      this.push('gift', name, 'Ativou CHUVA DE METEOROS', Math.max(1, total));
    } else if (total >= 10) {
      h.damage += Math.min(32, total * .22);
      h.shield += Math.min(120, total * 1.6);
      this.announce('MODO BERSERK', name.toUpperCase() + ' ME DEU FORÇA!', '#c88bff', 3);
      this.say(name + ', você me deixou MUITO mais forte!', 4);
      this.pulse(h.x, h.y, '#c88bff', 255, 75);
      this.visual('berserk', h.x, h.y, 4, { follow: true });
      this.push('gift', name, 'Ativou BERSERK', Math.max(1, total));
    } else {
      this.heal(14 * count);
      this.announce('CURA CELESTIAL', name.toUpperCase() + ' ENVIOU UM PRESENTE', '#53e7d0', 2.7);
      this.say('Valeu pela força, ' + name + '!', 3.6);
      this.pulse(h.x, h.y, '#53e7d0', 135);
      this.push('gift', name, 'Enviou ' + (event.giftName || 'um presente') + ' x' + count, total);
    }
  }

  interact(event) {
    if (!event || this.phase !== 'combat') return;
    const name = (event.user?.nickname || event.user?.username || 'Alguém').trim().slice(0, 22);
    const h = this.hero;
    switch (event.type) {
      case 'gift':
        this.gift(event, name);
        break;
      case 'chat': {
        const message = String(event.text || '').trim().slice(0, 96).toLowerCase();
        if (!message) break;
        const key = (event.user?.id || event.user?.username || name).slice(0, 50);
        if ((this.chatCooldowns.get(key) ?? -100) + 9 > this.t) break;
        this.chatCooldowns.set(key, this.t);
        const action = message.split(/\s+/)[0];
        this.addSupport(name, 1);
        const controls = {
          '!cura': () => { this.heal(34); this.say('Recebi a cura de ' + name + '!'); },
          '!fogo': () => { this.visual('fire', h.x, h.y, 1.3); this.pulse(h.x, h.y, '#ff915f', 265, 65); this.say(name + ' lançou CHAMAS!', 3.4); },
          '!gelo': () => { this.flares.push({ kind: 'freeze', x: h.x, y: h.y, ttl: 3 }); this.pulse(h.x, h.y, '#66d9ff', 275, 23); this.say('Congelaram tudo! Boa, ' + name + '!'); },
          '!escudo': () => { h.shield += 40; this.say(name + ' ativou meu escudo!'); this.pulse(h.x, h.y, '#b68cff', 130); },
          '!boss': () => { this.spawnBoss(); this.say('Você quer dificuldade, ' + name + '?!'); }
        };
        if (controls[action]) controls[action]();
        else if (this.lineTtl < 1.3) this.say(name + ', eu li sua mensagem!', 3.4);
        this.push('chat', name, String(event.text || '').slice(0, 85));
        break;
      }
      case 'like': {
        const count = clamp(event.count || 0, 0, 10000);
        this.likeCharge += count;
        const bursts = Math.min(8, Math.floor(this.likeCharge / 100));
        if (bursts) {
          this.likeCharge -= bursts * 100;
          this.heal(8 * bursts);
          this.pulse(h.x, h.y, '#59caff', 185, 27 * bursts);
          this.visual('lightning', h.x, h.y, .7);
          this.say('O chat está carregando minha energia!', 3.5);
          this.announce('100 CURTIDAS = CHOQUE', 'RAIO COLETIVO ATIVADO', '#63d7ff', 2);
          this.push('like', 'Comunidade', '+' + bursts * 100 + ' curtidas: CHOQUE!');
        }
        break;
      }
      case 'follow':
        this.visual('summon', h.x - 40, h.y + 15, 1.2);
        this.allies.push({ x: h.x - 40, y: h.y + 15, ttl: 28, name, attackClock: .6, phase: random(0, Math.PI * 2) });
        this.allies.length = Math.min(8, this.allies.length);
        this.say('Bem-vindo ao esquadrão, ' + name + '!');
        this.announce('NOVO ALIADO', name.toUpperCase() + ' ENTROU NO TIME', '#67e7d9');
        this.push('follow', name, 'Invocou um aliado por 28 segundos');
        this.addSupport(name, 15);
        break;
      case 'share':
        this.pulse(h.x, h.y, '#ffcb73', 310, 100);
        this.say('Valeu por compartilhar, ' + name + '!');
        this.push('share', name, 'Bomba de luz ativada!');
        this.addSupport(name, 8);
        break;
      case 'subscribe':
        this.heal(75);
        h.shield += 80;
        this.announce('GUARDIÃO VIP', name.toUpperCase(), '#ffe28a');
        this.say('Um guardião chegou! Valeu, ' + name + '!');
        this.push('subscribe', name, 'Escudo VIP e recuperação');
        this.addSupport(name, 100);
        break;
      case 'join':
        if (Math.random() < .12 && this.lineTtl < .8) this.say('Mais gente chegando! Vamos!');
        break;
    }
  }

  damageEnemy(enemy, amount, magic = false) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount;
    enemy.hitFlash = .18;
    this.visual('hit', enemy.x, enemy.y, .24, { color: magic ? '#8cfaff' : '#ffe5aa', angle: Math.atan2(enemy.y - this.hero.y, enemy.x - this.hero.x) });
    this.float(Math.round(amount).toString(), enemy.x + random(-12, 12), enemy.y - enemy.r, magic ? '#79f6fd' : '#ffec9c', magic ? 25 : 20);
    this.sparks(enemy.x, enemy.y, colors[enemy.type], magic ? 10 : 5, .8);
    if (enemy.hp <= 0) {
      this.visual('death', enemy.x, enemy.y, enemy.type === 'boss' ? 1.2 : .65, { type:enemy.type, color: colors[enemy.type], radius: enemy.type === 'boss' ? 180 : 52 });
      this.kills++;
      this.combo = (this.t - this.lastKillAt < 4) ? this.combo + 1 : 1;
      this.lastKillAt = this.t;
      const reward = (enemy.type === 'boss' ? 2500 : 45) * Math.min(5, 1 + this.combo * .05);
      this.score += Math.round(reward);
      this.hero.xp += enemy.type === 'boss' ? 18 : 1;
      this.sparks(enemy.x, enemy.y, enemy.type === 'boss' ? '#ffd48b' : colors[enemy.type], enemy.type === 'boss' ? 65 : 14, 1.9);
      if (enemy.type === 'boss') {
        this.announce('CHEFE DERROTADO', 'O CHAT SALVOU A ARENA!', '#ffe39a', 4.5);
        this.say('EU CONSEGUI! Essa foi por vocês!', 5);
        this.heal(60);
        this.shake = 22;
      }
      this.enemies = this.enemies.filter(e => e.hp > 0);
    }
  }

  upgrade() {
    const h = this.hero;
    if (h.xp < h.xpNext) return;
    h.xp -= h.xpNext;
    h.level++;
    h.xpNext = Math.ceil(h.xpNext * 1.38);
    const index = (h.level - 2) % 4;
    const names = ['ESPADA EVOLUÍDA', 'MAIS VIDA', 'ATAQUE RÁPIDO', 'PASSOS FANTASMAS'];
    if (index === 0) h.damage += 7;
    if (index === 1) { h.maxHp += 30; this.heal(45); }
    if (index === 2) h.rate = Math.max(.18, h.rate - .055);
    if (index === 3) h.speed += 15;
    this.announce('LEVEL ' + h.level, names[index], '#8d96ff');
    this.pulse(h.x, h.y, '#a8a2ff', 110);
  }

  update(dt) {
    dt = clamp(dt, 0, .05);
    this.t += dt;
    this.lineTtl = Math.max(0, this.lineTtl - dt);
    if (this.callout) this.callout.ttl -= dt;
    this.shake = Math.max(0, this.shake - dt * 32);
    const h = this.hero;
    h.hitClock = Math.max(0, h.hitClock - dt);
    h.dashClock = Math.max(0, h.dashClock - dt);
    h.attackPose = Math.max(0, h.attackPose - dt);
    h.vx *= Math.exp(-dt * 12); h.vy *= Math.exp(-dt * 12);
    for (const v of this.visuals) v.ttl -= dt;
    this.visuals = this.visuals.filter(v => v.ttl > 0);
    for (const trail of h.trail) trail.ttl -= dt;
    h.trail = h.trail.filter(trail => trail.ttl > 0);
    this.particles = this.particles.filter(p => p.ttl > 0);
    for (const p of this.particles) { p.ttl -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 230; }
    this.floaters = this.floaters.filter(f => f.ttl > 0);
    for (const f of this.floaters) { f.ttl -= dt; f.y -= dt * 45; }
    this.effects = this.effects.filter(e => e.ttl > 0);
    for (const e of this.effects) e.ttl -= dt;
    this.flares = this.flares.filter(f => f.ttl > 0);
    for (const f of this.flares) f.ttl -= dt;
    if (this.phase === 'dead') {
      this.afterDeath -= dt;
      if (this.afterDeath <= 0) this.reset();
      return;
    }
    this.waveTime += dt;
    this.spawnClock -= dt;
    if (this.spawnClock <= 0 && !(this.bossSummoned && this.enemies.some(e => e.type === 'boss'))) {
      this.spawnEnemy();
      this.spawnClock = Math.max(.65, 2.25 - this.wave * .17) * random(.8, 1.3);
    }
    if (this.waveTime > 37 && !this.bossSummoned) this.spawnBoss();
    if (this.bossSummoned && !this.enemies.some(e => e.type === 'boss') && this.waveTime > 38) {
      this.wave++;
      this.waveTime = 0;
      this.bossSummoned = false;
      this.heal(42);
      this.announce('ONDA ' + this.wave, 'A ARENA FICOU MAIS PERIGOSA', '#5df5d8', 3.2);
    }

    const agent=this.agentDecision?.expiresAt>this.t?this.agentDecision:null;
    h.noFire=agent?.fire===false;
    const chosen=agent?.targetId?this.enemies.find(e=>e.id===agent.targetId&&e.hp>0):null;
    const nearest = chosen||selectTarget(this.enemies,h,h.targetId);
    if (nearest) {
      h.targetId = nearest.id;
      const d = Math.max(1, distance(h, nearest));
      const dx = (nearest.x - h.x) / d, dy = (nearest.y - h.y) / d;
      h.aim = Math.atan2(dy, dx);
      h.facing = dx > 0 ? 1 : -1;
      let vx = dx, vy = dy;
      // O NPC circula o alvo quando esta perto e foge se estiver cercado.
      if (d < 140) { vx = -dx * .75 - dy * .7; vy = -dy * .75 + dx * .7; }
      if(agent){
        const directions={approach:[dx,dy],retreat:[-dx,-dy],orbit_left:[dy,-dx],orbit_right:[-dy,dx],hold:[0,0],north:[0,-1],south:[0,1],east:[1,0],west:[-1,0]};
        [vx,vy]=directions[agent.movement]||[vx,vy];
      }
      const close = this.enemies.filter(e => distance(e, h) < 95).length;
      if ((agent?agent.dash:close >= 3) && h.dashClock === 0) {
        h.dashClock = 3.8;
        this.pulse(h.x, h.y, '#8bf2f9', 100, 25);
        if(!agent){vx = -dx; vy = -dy;}
      }
      const speed = h.speed * (h.dashClock > 3.45 ? 2.7 : 1);
      const beforeX = h.x, beforeY = h.y;
      h.x = clamp(h.x + vx * speed * dt, LIMITS.left + 22, LIMITS.right - 22);
      h.y = clamp(h.y + vy * speed * dt, LIMITS.top + 22, LIMITS.bottom - 22);
      h.vx = dt > 0 ? (h.x-beforeX)/dt : 0; h.vy = dt > 0 ? (h.y-beforeY)/dt : 0;
      h.stride += Math.hypot(h.x-beforeX,h.y-beforeY) * .085;
      h.trailClock -= dt;
      if (h.trailClock <= 0) {
        h.trailClock = .045;
        h.trail.push({ x:h.x, y:h.y, facing:h.facing, ttl:.28 });
        if (h.trail.length > 7) h.trail.shift();
      }
      h.attackClock = Math.max(0,h.attackClock-dt);
      if (h.attackClock <= 0 && !h.noFire) {
        h.attackClock = h.rate;
        h.attackPose = Math.min(.28,h.rate*.8); h.attackSerial++;
        const origin={x:h.x+h.facing*25,y:h.y-25};
        const aim=intercept(origin,nearest,550,1.1);
        h.aim=aim.angle;
        this.visual('slash', h.x, h.y-25, .28, { angle:h.aim, flip:h.attackSerial%2 });
        this.combatStats.shots++;
        this.bullets.push({ ...origin, vx:Math.cos(aim.angle)*550, vy:Math.sin(aim.angle)*550, r:11, ttl:1.1, damage:h.damage, friendly:true, source:'hero', color:'#93f9f3' });
        this.sparks(h.x + h.facing * 33, h.y - 22, '#bafff5', 5, .55);
      }
    }

    for (const e of [...this.enemies]) {
      e.a += dt * 3;
      e.born = Math.max(0,e.born-dt); e.hitFlash = Math.max(0,e.hitFlash-dt);
      const d = Math.max(1, distance(e, h));
      e.aim = Math.atan2(h.y-e.y,h.x-e.x);
      e.moving = d > e.r + 21;
      e.vx=0;e.vy=0;
      e.frozen = this.flares.some(f => f.kind === 'freeze' && distance(e, f) < 275);
      if (d > e.r + 21) {
        const move = e.frozen ? .16 : 1;
        e.stride += e.speed * move * dt * .09;
        e.vx=(h.x-e.x)/d*e.speed*move;e.vy=(h.y-e.y)/d*e.speed*move;
        e.x += e.vx*dt;
        e.y += e.vy*dt;
      } else if (h.hitClock <= 0) {
        let damage = e.damage;
        if (h.shield > 0) { const absorb = Math.min(h.shield, damage); h.shield -= absorb; damage -= absorb; }
        h.hp -= damage;
        h.hitClock = .62;
        this.shake = Math.max(this.shake, 5);
        this.float('-' + Math.round(damage), h.x, h.y - 65, '#ff7294');
        this.sparks(h.x, h.y, '#ff5681', 12);
      }
      if (e.type === 'boss') {
        e.attackClock -= dt;
        if (e.attackClock <= 0) {
          e.attackClock = 2.3;
          this.visual('bossAttack', e.x, e.y, .55, { angle:e.aim });
          for (let i = 0; i < 7; i++) {
            const a = Math.atan2(h.y - e.y, h.x - e.x) + (i - 3) * .19;
            this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, ttl: 3, r: 11, damage: 12, friendly: false, color: '#ff9a70' });
          }
        }
      }
    }
    this.bullets = this.bullets.filter(b => b.ttl > 0);
    for (const b of this.bullets) {
      const oldX=b.x,oldY=b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.ttl -= dt;
      if (b.friendly) {
        let target=null,first=Infinity;
        for(const e of this.enemies){
          const hit=segmentCircleHit(oldX,oldY,b.x,b.y,e.x,e.y,e.r+b.r);
          if(hit!==null&&hit<first){target=e;first=hit;}
        }
        if (target) { this.damageEnemy(target, b.damage); b.ttl = 0; if(b.source==='hero')this.combatStats.hits++; }
      } else if (distance(h, b) < 19 + b.r && h.hitClock === 0) {
        const absorb = Math.min(h.shield, b.damage);
        h.shield -= absorb; h.hp -= b.damage - absorb;
        h.hitClock = .35; b.ttl = 0;
        this.sparks(h.x, h.y, '#ff8a62', 8);
      }
    }
    for (const ally of this.allies) {
      ally.ttl -= dt; ally.phase += dt;
      ally.x = h.x + Math.cos(ally.phase * 2) * 88;
      ally.y = h.y + Math.sin(ally.phase * 2) * 74;
      ally.attackClock -= dt;
      if (ally.attackClock <= 0) {
        ally.attackClock = .85;
        const enemy = [...this.enemies].sort((a,b) => distance(a,ally)-distance(b,ally))[0];
        if (enemy) {
          const aim=intercept(ally,enemy,440,1.5);
          this.bullets.push({x:ally.x,y:ally.y,vx:Math.cos(aim.angle)*440,vy:Math.sin(aim.angle)*440,ttl:1.5,r:8,damage:15,friendly:true,color:'#ffe3b2'});
        }
      }
    }
    this.allies = this.allies.filter(a => a.ttl > 0);
    this.upgrade();
    if (h.hp <= 0) {
      this.phase = 'dead';
      this.afterDeath = 5;
      this.runs++;
      this.best = Math.max(this.best, this.score);
      this.announce('O HERÓI CAIU', 'RECOMEÇANDO EM 5 SEGUNDOS', '#ff698e', 4.7);
      this.say('Fui de base... mas eu VOLTO!', 4.7);
      this.sparks(h.x, h.y, '#ff77ad', 70, 2);
      this.push('system', 'Nova tentativa em 5s', 'O NPC se levanta sozinho.');
    }
  }
}
