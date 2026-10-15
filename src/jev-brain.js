import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const MOVES = new Set(['approach','retreat','orbit_left','orbit_right','hold','north','south','east','west','evade_orbit']);
const finite = (value, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 0;
const safeInt = (value, max = 1000000) => Math.round(finite(value, 0, max));
const fmt = (v) => Number(v.toFixed(3));

export function contextFor(frame) {
  if (frame.projectiles >= 2) return 'projectile_danger';
  if (frame.hpRatio <= 0.35) return 'low_health';
  if (frame.closeEnemies >= 2) return 'surrounded';
  if (frame.nearestDistance >= 190) return 'far_target';
  return 'normal';
}

// A recompensa mede o que aconteceu *depois* da escolha; nao confundir correlacao com causalidade.
export function evaluateTrajectory(frames) {
  const buckets = {};
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i], b = frames[i + 1];
    const movement = a.movement;
    if (!MOVES.has(movement) || !Number.isFinite(a.t) || !Number.isFinite(b.t)) continue;
    const dt = b.t - a.t;
    if (dt < 0.18 || dt > 3.5) continue;
    const key = contextFor(a);
    const damage = Math.max(0, b.damageTaken - a.damageTaken);
    const impacts = Math.max(0, b.hitsTaken - a.hitsTaken);
    const kills = Math.max(0, b.kills - a.kills);
    const reward = finite((Math.min(dt, 1) * 0.12) + kills * 1.8 - damage * .075 - impacts * 1.5, -15, 12);
    const cell = (buckets[key] ??= {});
    const value = (cell[movement] ??= { samples: 0, sum: 0, damage: 0, impacts: 0 });
    value.samples++;
    value.sum += reward;
    value.damage += damage;
    value.impacts += impacts;
  }
  return buckets;
}

function normalizeFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const movement = String(frame.movement || '');
  if (!MOVES.has(movement)) return null;
  return {
    t: fmt(finite(frame.t, 0, 86400)),
    movement,
    source: frame.source === 'typesafe-api' ? 'typesafe-api' : frame.source === 'learned-local' ? 'learned-local' : 'baseline',
    hpRatio: fmt(finite(frame.hpRatio, 0, 1)),
    nearestDistance: safeInt(frame.nearestDistance, 3000),
    closeEnemies: safeInt(frame.closeEnemies, 40),
    projectiles: safeInt(frame.projectiles, 40),
    hitsTaken: safeInt(frame.hitsTaken),
    damageTaken: fmt(finite(frame.damageTaken, 0, 1000000)),
    kills: safeInt(frame.kills),
    wave: safeInt(frame.wave, 1000)
  };
}

export function reviewDeath(frames){
  const end=frames.at(-1);
  const recent=frames.filter(f=>f.t>=end.t-6);
  const prior=recent[0];
  return {context:contextFor(prior),movement:prior.movement,
    damage:Math.max(0,end.damageTaken-prior.damageTaken),
    impacts:Math.max(0,end.hitsTaken-prior.hitsTaken),
    warning:'Associacao observada antes da morte; nao prova causalidade.'};
}

export function normalizeMatch(raw) {
  if (!raw || !Array.isArray(raw.frames) || raw.frames.length < 2 || raw.frames.length > 2400) throw new Error('invalid_match');
  const frames = raw.frames.map(normalizeFrame);
  if (frames.some(f => !f)) throw new Error('invalid_match');
  for (let i = 1; i < frames.length; i++) if (frames[i].t < frames[i - 1].t) throw new Error('invalid_match');
  const id = typeof raw.id === 'string' && /^[\w-]{12,80}$/.test(raw.id) ? raw.id : randomUUID();
  return {
    id, date: typeof raw.date === 'string' && /^20\d\d-\d\d-\d\dT/.test(raw.date) && !Number.isNaN(Date.parse(raw.date)) ? new Date(raw.date).toISOString() : new Date().toISOString(),
    outcome: raw.outcome === 'survived' ? 'survived' : 'dead',
    duration: fmt(finite(raw.duration, 0, 86400)),
    wave: safeInt(raw.wave, 1000), kills: safeInt(raw.kills), score: safeInt(raw.score, 100000000),
    shots: safeInt(raw.shots), shotsHit: safeInt(raw.shotsHit),
    damageTaken: fmt(finite(raw.damageTaken, 0, 1000000)),
    hitsTaken: safeInt(raw.hitsTaken), projectileHits: safeInt(raw.projectileHits),
    deathReview: reviewDeath(frames),
    frames
  };
}

const newState = () => ({ version: 1, matches: 0, bestScore: 0, bestWave: 0, sumDamage: 0, sumDuration: 0, cells: {}, mistakes: {} });

export function mergeExperience(state, match) {
  state.matches++;
  const review=match.deathReview||reviewDeath(match.frames);
  if(review.damage>0){
    const key=review.context+':'+review.movement;
    state.mistakes[key]=(state.mistakes[key]||0)+1;
  }
  state.bestScore = Math.max(state.bestScore, match.score);
  state.bestWave = Math.max(state.bestWave, match.wave);
  state.sumDamage += match.damageTaken;
  state.sumDuration += match.duration;
  for (const [context, actions] of Object.entries(evaluateTrajectory(match.frames))) {
    const target = (state.cells[context] ??= {});
    for (const [action, value] of Object.entries(actions)) {
      const cell = (target[action] ??= { samples: 0, sum: 0, damage: 0, impacts: 0 });
      for (const field of ['samples','sum','damage','impacts']) cell[field] += value[field];
    }
  }
  return state;
}

export function policyFrom(state) {
  const contexts = {};
  for (const [context, actions] of Object.entries(state.cells)) {
    const ranked = Object.entries(actions)
      .filter(([move, v]) => MOVES.has(move) && move !== 'hold' && v.samples >= 8)
      .map(([movement, v]) => ({ movement, samples: v.samples, mean: v.sum / v.samples, hitsPerSample: v.impacts / v.samples }))
      .sort((a,b) => b.mean - a.mean);
    // A politica so assume uma preferencia quando existe evidencia suficiente.
    if (ranked.length && ranked[0].samples >= 12 && ranked[0].mean > -.65) {
      contexts[context] = { movement: ranked[0].movement, samples: ranked[0].samples, meanReward: fmt(ranked[0].mean) };
    }
  }
  return { version: 1, matches: state.matches, bestScore: state.bestScore, bestWave: state.bestWave, targetWave:Math.max(8,state.bestWave+1), contexts, mistakes:state.mistakes };
}

const oneLine = (s) => String(s).replaceAll('\n',' ').slice(0, 200);
export function matchNote(match) {
  const accuracy = match.shots ? Math.round(match.shotsHit * 100 / match.shots) : 0;
  return `# Jev — partida ${match.id}\n\nData: ${match.date}\nResultado: ${match.outcome}\nDuracao: ${match.duration}s\nOnda: ${match.wave}\nAbates: ${match.kills}\nPontuacao: ${match.score}\nDano recebido: ${match.damageTaken}\nAcertos no heroi: ${match.hitsTaken} (${match.projectileHits} por projeteis)\nPrecisao dos tiros: ${accuracy}% (${match.shotsHit}/${match.shots})\nAmostras de movimento: ${match.frames.length}\n\nDados estruturados: [[${match.id}.json]]\n`;
}

export function learningNote(state) {
  const policy = policyFrom(state);
  const lessons = Object.entries(policy.contexts).map(([context, rule]) => `- ${context}: ${oneLine(rule.movement)} — ${rule.samples} amostras, recompensa media ${rule.meanReward}. Hipotese estatistica; reavaliar conforme acumular partidas.`);
  return `# Aprendizados automaticos da Jev\n\nPartidas registradas: ${state.matches}\nMaior pontuacao: ${state.bestScore}\nMaior onda: ${state.bestWave}\nMedia de dano por partida: ${state.matches ? (state.sumDamage / state.matches).toFixed(1) : 0}\nMedia de sobrevivencia (s): ${state.matches ? (state.sumDuration / state.matches).toFixed(1) : 0}\n\n## Politica de sobrevivencia baseada em resultados\n${lessons.join('\n') || '- Aguardando amostras suficientes para recomendar movimentos.'}\n\nRecompensa: sobrevivencia e abates positivos; impactos e dano sofrido negativos. Associacoes observadas nao garantem vitorias ou causalidade.\n`;
}

function defaultBrainPath(env) {
  if (env.JEV_BRAIN_PATH) return path.resolve(env.JEV_BRAIN_PATH);
  if (process.platform === 'win32') return path.join(os.homedir(), 'Desktop', 'Cerebro do Jev');
  return path.resolve('data', 'cerebro-jev');
}

export function createBrain({env = process.env, root = defaultBrainPath(env)} = {}) {
  let state = newState();
  let pending = Promise.resolve();
  let initialized;
  const parts = path.join(root, '04 - Partidas');
  const learning = path.join(root, '05 - Aprendizados');
  const model = path.join(root, '08 - Modelos');
  const notesDir = path.join(root, '07 - Memoria para API');
  const notesFile = path.join(notesDir, 'Memoria editavel.md');
  const MAX_NOTES = 12000;
  let notes = '';
  const writeDerived = async () => {
    await writeFile(path.join(model,'politica-jev.json'), JSON.stringify(policyFrom(state),null,2)+'\n');
    await writeFile(path.join(learning,'Aprendizados automaticos.md'), learningNote(state));
  };
  const initialize = () => initialized ??= (async () => {
    await Promise.all([mkdir(parts, {recursive:true}),mkdir(learning,{recursive:true}),mkdir(model,{recursive:true}),mkdir(notesDir,{recursive:true})]);
    try { notes = (await readFile(notesFile, 'utf8')).slice(0, MAX_NOTES); }
    catch (error) { if(error.code!=='ENOENT')throw error; }
    // Reconstruir sempre a partir das partidas completas torna o armazenamento verificavel e recuperavel.
    const files = (await readdir(parts)).filter(f => /^[\w-]+\.json$/.test(f)).sort();
    for (const file of files) {
      try { mergeExperience(state, normalizeMatch(JSON.parse(await readFile(path.join(parts,file),'utf8')))); }
      catch (error) { console.warn('Partida Jev ignorada:', file, error.message); }
    }
  })();
  const save = (raw) => {
    const task = pending.then(async () => {
      await initialize();
      const match = normalizeMatch(raw);
      const filename = path.join(parts, match.id+'.json');
      try { await readFile(filename); return { duplicate:true, id:match.id, policy:policyFrom(state) }; }
      catch (error) { if(error.code!=='ENOENT') throw error; }
      await writeFile(filename, JSON.stringify(match)+'\n', {flag:'wx'});
      await writeFile(path.join(parts,match.id+'.md'), matchNote(match));
      mergeExperience(state, match);
      await writeDerived();
      return { duplicate:false, id:match.id, policy:policyFrom(state) };
    });
    pending = task.catch(()=>{});
    return task;
  };
  const getPolicy = async () => { await pending; await initialize(); return policyFrom(state); };
  const getRecent = async (limit = 200) => {
    await pending; await initialize();
    const files = (await readdir(parts)).filter(f=>/^[\w-]+\.json$/.test(f));
    const matches = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(parts,file),'utf8'))));
    return matches.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,Math.min(limit,2000));
  };
  const getNotes = async () => { await pending; await initialize(); return notes; };
  const editNotes = text => {
    if(typeof text!=='string'||text.length>MAX_NOTES)throw Error('invalid_notes');
    const task=pending.then(async()=>{
      await initialize();
      const tmp=notesFile+'.tmp';
      await writeFile(tmp,text,'utf8');
      await rename(tmp,notesFile);
      notes=text;
      return notes;
    });
    pending=task.catch(()=>{});
    return task;
  };
  const importMemory = (input) => {
    if(!input||!Array.isArray(input.matches)||input.matches.length>500||!['merge','replace'].includes(input.mode)
      ||typeof input.notes!=='string'||input.notes.length>MAX_NOTES)throw Error('invalid_import');
    const matches=input.matches.map(normalizeMatch);
    if(new Set(matches.map(m=>m.id)).size!==matches.length)throw Error('invalid_import');
    const task=pending.then(async()=>{
      await initialize();
      if(input.mode==='replace')throw Error('invalid_import');

      let added=0;
      for(const match of matches){
        const file=path.join(parts,match.id+'.json');
        try{
          await writeFile(file,JSON.stringify(match)+'\n',{flag:'wx'});
          added++;
          await writeFile(path.join(parts,match.id+'.md'),matchNote(match));
          mergeExperience(state,match);
        }catch(error){if(error.code!=='EEXIST')throw error;}
      }
      const tmp=notesFile+'.tmp';
      await writeFile(tmp,input.notes);
      await rename(tmp,notesFile);
      notes=input.notes;
      await writeDerived();
      return {added,policy:policyFrom(state)};
    });
    pending=task.catch(()=>{});
    return task;
  };
  const getDashboard = async () => {
    const [policy,matches,text] = await Promise.all([getPolicy(),getRecent(30),getNotes()]);
    return { policy,notes:text,storage:'server',recent:matches.map(({id,date,duration,kills,wave,score,damageTaken,hitsTaken,projectileHits})=>
      ({id,date,duration,kills,wave,score,damageTaken,hitsTaken,projectileHits})) };
  };
  return { root, save, getPolicy, getRecent, getNotes, editNotes, importMemory, getDashboard };
}
