const names={approach:'Avançar',retreat:'Recuar',orbit_left:'Circular à esquerda',orbit_right:'Circular à direita',hold:'Manter posição',north:'Subir',south:'Descer',east:'Mover à direita',west:'Mover à esquerda'};

export class JevPilot {
  constructor(game,onStatus){
    this.game=game;this.onStatus=onStatus;this.enabled=false;this.generation=0;
  }
  async init(){
    try{
      const response=await fetch('/api/jev/status');
      this.config=await response.json();
      this.onStatus({state:this.config.ready?'ready':'unconfigured',text:this.config.ready?'Jev pronta para conectar.':'Conexão da Jev ainda não configurada.'});
      const token=sessionStorage.getItem('jev-control');
      if(this.config.ready&&token)this.start(token);
    }catch{this.onStatus({state:'error',text:'Não foi possível consultar a conexão da Jev.'});}
  }
  start(token){
    if(!this.config?.ready||!token)return;
    this.stop(false);this.token=token;this.enabled=true;
    sessionStorage.setItem('jev-control',token);this.loop(this.generation);
  }
  stop(clear=true){
    this.enabled=false;this.generation++;clearTimeout(this.timer);this.abort?.abort();
    this.game.agentDecision=null;
    if(clear){sessionStorage.removeItem('jev-control');this.onStatus({state:'ready',text:'Piloto local ativo. Jev desconectada.'});}
  }
  async loop(generation){
    if(!this.enabled||generation!==this.generation)return;
    if(document.hidden||this.game.phase!=='combat'){
      this.game.agentDecision=null;
      this.onStatus({state:'waiting',text:document.hidden?'Jev em espera: aba em segundo plano.':'Jev aguardando a próxima rodada.'});
      this.timer=setTimeout(()=>this.loop(generation),2000);return;
    }
    const run=this.game.runs,g=this.game,h=g.hero;
    const state={wave:g.wave,hero:{x:h.x,y:h.y,hp:h.hp,maxHp:h.maxHp,shield:h.shield,dashReady:h.dashClock===0},
      enemies:[...g.enemies].sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y)).slice(0,12).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,vx:e.vx,vy:e.vy,r:e.r})),
      projectiles:g.bullets.filter(b=>!b.friendly).slice(0,12).map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy}))};
    if(!g.agentDecision)this.onStatus({state:'thinking',text:'Consultando a Jev. Piloto local mantém o combate.'});
    this.abort=new AbortController();
    const timeout=setTimeout(()=>this.abort.abort(),3500);
    let delay=2000;
    try{
      const response=await fetch('/api/jev/decision',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token}`},body:JSON.stringify(state),signal:this.abort.signal});
      const result=await response.json();
      if(generation!==this.generation)return;
      if(response.status===401){this.stop();this.onStatus({state:'error',text:'Código de controle inválido. Piloto local ativo.'});return;}
      if(!response.ok||result.source!=='typesafe-api'||!names[result.movement])throw Error('unavailable');
      if(run===g.runs&&g.phase==='combat'){
        g.agentDecision={...result,expiresAt:g.t+4};
        this.onStatus({state:'active',text:`${names[result.movement]} · ${result.fire?'atacar':'aguardar'} · ${Math.round(result.confidence*100)}% de confiança`,latencyMs:result.latencyMs,model:result.model});
      }
    }catch{
      if(generation!==this.generation)return;
      g.agentDecision=null;delay=5000;
      this.onStatus({state:'error',text:'Jev indisponível. Piloto local ativo; nova tentativa automática.'});
    }finally{clearTimeout(timeout);}
    if(this.enabled&&generation===this.generation)this.timer=setTimeout(()=>this.loop(generation),delay);
  }
}
