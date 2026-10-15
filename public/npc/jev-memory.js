// Memoria de episodios: cada derrota fecha uma partida, mesmo sem API TypeSafe.
import { writeMatchToFolder, writeBrainToFolder, archiveEpisode } from './jev-folder.js';
const KEY='jev-match-queue-v1';
const OPTIONS=['approach','retreat','orbit_left','orbit_right','north','south','east','west'];
const limit=(n,min,max)=>Math.min(max,Math.max(min,n));

export function frameOf(game){
  const h=game.hero;
  const distances=game.enemies.filter(e=>e.hp>0).map(e=>Math.hypot(e.x-h.x,e.y-h.y));
  return {
    t:Math.round(game.t*100)/100,
    movement:game.lastMovement,
    source:game.lastMovementSource,
    hpRatio:limit(h.hp/h.maxHp,0,1),
    nearestDistance:distances.length?Math.round(Math.min(...distances)):3000,
    closeEnemies:distances.filter(d=>d<115).length,
    projectiles:game.bullets.filter(b=>!b.friendly&&Math.hypot(b.x-h.x,b.y-h.y)<210).length,
    hitsTaken:game.combatStats.hitsTaken,
    damageTaken:game.combatStats.damageTaken,
    kills:game.kills,wave:game.wave
  };
}

function dangerBullet(game){
  const h=game.hero;
  for(const b of game.bullets){
    if(b.friendly)continue;
    const dx=h.x-b.x,dy=h.y-b.y,speed2=b.vx*b.vx+b.vy*b.vy;
    if(speed2<100)continue;
    const t=limit((dx*b.vx+dy*b.vy)/speed2,0,.55);
    if(t<.06)continue;
    const miss=Math.hypot(dx-b.vx*t,dy-b.vy*t);
    if(miss<52)return b;
  }
  return null;
}

export class JevMemory {
  constructor(game,getToken){
    this.game=game;this.getToken=getToken;
    this.frames=[];this.lastFrame=-1;this.localAt=-1;
    this.policy=null;this.busy=false;
    this.queue=this.loadQueue();
    game.onGameOver=()=>this.finish();
    void this.refreshPolicy();
    this.retryTimer=setInterval(()=>void this.flush(),15000);
  }
  loadQueue(){
    try{
      const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');
      return Array.isArray(parsed)?parsed:[];
    }catch{return [];}
  }
  persistQueue(){
    try{localStorage.setItem(KEY,JSON.stringify(this.queue));}
    catch{ /* Sem espaco no navegador: mantem os registros desta sessao na memoria. */ }
  }
  async refreshPolicy(){
    try{
      const response=await fetch('/api/jev/policy',{cache:'no-store'});
      if(response.ok)this.policy=await response.json();
    }catch{/* Servidor offline: jogo continua autonomo. */}
  }
  context(f){
    if(f.projectiles>=2)return 'projectile_danger';
    if(f.hpRatio<=.35)return 'low_health';
    if(f.closeEnemies>=2)return 'surrounded';
    if(f.nearestDistance>=190)return 'far_target';
    return 'normal';
  }
  tick(){
    const g=this.game;
    if(g.phase!=='combat')return;
    // Desviar de projeteis iminentes; prioridades defensivas sobre exploracao estatistica.
    if(g.t-this.localAt>=.22){
      this.localAt=g.t;
      const remote=g.agentDecision?.source==='typesafe-api'&&g.agentDecision.expiresAt>g.t;
      if(!remote){
        const bullet=dangerBullet(g);
        let move;
        if(bullet){
          const vx=-bullet.vy,vy=bullet.vx;
          const left={x:g.hero.x+vx*.2,y:g.hero.y+vy*.2};
          const right={x:g.hero.x-vx*.2,y:g.hero.y-vy*.2};
          const space=p=>Math.min(p.x-100,620-p.x,p.y-445,1110-p.y);
          const selected=space(left)>=space(right)?{x:vx,y:vy}:{x:-vx,y:-vy};
          move=Math.abs(selected.x)>Math.abs(selected.y)?(selected.x>0?'east':'west'):(selected.y>0?'south':'north');
        }else{
          const f=frameOf(g),rule=this.policy?.contexts?.[this.context(f)];
          if(rule?.samples>=12&&OPTIONS.includes(rule.movement)
            && (this.policy?.mistakes?.[this.context(f)+':'+rule.movement]||0)<3
            && !(f.projectiles>0&&rule.movement==='approach')
            && !(f.hpRatio<.35&&rule.movement==='approach'))move=rule.movement;
        }
        if(move){
          g.agentDecision={movement:move,targetId:null,fire:true,dash:Boolean(bullet&&g.hero.dashClock===0),
            source:'learned-local',expiresAt:g.t+.33};
        }else if(g.agentDecision?.source==='learned-local')g.agentDecision=null;
      }
    }
    if(g.t-this.lastFrame>=.75&&this.frames.length<2400){
      this.frames.push(frameOf(g));this.lastFrame=g.t;
    }
  }
  finish(){
    const g=this.game;
    if(this.frames.length&&this.frames[this.frames.length-1].t!==g.t)this.frames.push(frameOf(g));
    const s=g.combatStats;
    const match={
      id:crypto.randomUUID(),date:new Date().toISOString(),outcome:'dead',duration:g.t,wave:g.wave,kills:g.kills,score:g.score,
      shots:s.shots,shotsHit:s.hits,damageTaken:s.damageTaken,hitsTaken:s.hitsTaken,
      projectileHits:s.projectileHits,frames:this.frames.slice(0,2400)
    };
    this.frames=[];this.lastFrame=-1;this.localAt=-1;
    if(match.frames.length<2)return;
    this.queue.push(match);this.persistQueue();
    void archiveEpisode(match).then(()=>{
      const el=document.getElementById('memory-save-status');if(el)el.textContent='Partida arquivada neste navegador. Pendentes no servidor: '+this.queue.length;
    }).catch(()=>{
      const el=document.getElementById('memory-save-status');if(el)el.textContent='Falha no arquivo local. Exporte a memória antes de fechar.';
    });
    void writeMatchToFolder({...match,date:new Date().toISOString()}).catch(()=>{});
    void this.flush();
  }
  async flush(){
    if(this.busy||!this.queue.length)return;
    const token=this.getToken();
    if(!token||token.length<24)return;
    this.busy=true;
    try{
      let updated=false;
      while(this.queue.length){
        const response=await fetch('/api/jev/memory/match',{method:'POST',
          headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(this.queue[0])});
        if(!response.ok)break;
        updated=true;
        this.queue.shift();this.persistQueue();
        const el=document.getElementById('memory-save-status');if(el)el.textContent='Servidor confirmou a gravação. Pendentes: '+this.queue.length;
      }
      await this.refreshPolicy();
      if(updated&&this.policy){
        const response=await fetch('/api/jev/memory/dashboard',{
          headers:{Authorization:'Bearer '+token}});
        if(response.ok){
          const data=await response.json();
          await writeBrainToFolder({policy:data.policy,notes:data.notes}).catch(()=>{});
        }
      }
    }catch{/* A fila sobrevive a perda de rede e recarregamento da pagina. */}
    finally{this.busy=false;}
  }
}
