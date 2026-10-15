const names={approach:'Avançar',retreat:'Recuar',orbit_left:'Circular à esquerda',orbit_right:'Circular à direita',hold:'Manter posição',north:'Subir',south:'Descer',east:'Mover à direita',west:'Mover à esquerda'};
const configMessage={
  missing_api_key:'O Render ainda não entregou TYPESAFE_API_KEY ao servidor. Salve as variáveis e execute Save, deploy.',
  missing_control_token:'O Render ainda não entregou JEV_CONTROL_TOKEN ao servidor. Salve as variáveis e execute Save, deploy.',
  control_token_too_short:'JEV_CONTROL_TOKEN no Render precisa ter pelo menos 24 caracteres. Corrija e execute Save, deploy.'
};
const errorMessage={
  provider_auth:'A TypeSafe recusou a chave API (401/403). Confira TYPESAFE_API_KEY no Render.',
  provider_no_credits:'A TypeSafe informou créditos insuficientes (402).',
  provider_rate_limited:'A TypeSafe limitou as consultas (429). Tentando novamente.',
  provider_model_unavailable:'Modelo não encontrado. Confira JEV_MODEL no Render.',
  provider_bad_request:'A TypeSafe rejeitou o formato da solicitação. Confira o modelo configurado.',
  provider_invalid_response:'A TypeSafe respondeu em formato inesperado.',
  provider_timeout:'A TypeSafe demorou demais para responder. Nova tentativa em breve.',
  not_configured:'O servidor perdeu a configuração. Confira o deploy do Render.',
  rate_limit:'Aguardando intervalo entre decisões; tentando novamente.'
};

export class JevPilot {
  constructor(game,onStatus){
    this.training=new URLSearchParams(location.search).get('training')==='1';
    this.game=game;this.onStatus=onStatus;this.enabled=false;this.generation=0;
  }
  async init(){
    clearTimeout(this.refreshTimer);
    try{
      const response=await fetch('/api/jev/status',{cache:'no-store'});
      if(!response.ok)throw Error('status_unavailable');
      this.config=await response.json();
      this.onStatus({state:this.config.ready?'ready':'unconfigured',text:this.config.ready?'Jev pronta. Informe o código JEV_CONTROL_TOKEN para conectar.':configMessage[this.config.configuration]||'Conexão da Jev ainda não configurada no servidor.'});
      const token=sessionStorage.getItem('jev-control');
      if(this.config.memoryReady&&token)this.start(token);
    }catch{this.onStatus({state:'error',text:'Não foi possível consultar a conexão da Jev.'});}
    if(!this.enabled&&!this.config?.ready)this.refreshTimer=setTimeout(()=>this.init(),10000);
  }
  start(token){
    if(!this.config?.memoryReady){this.onStatus({state:'unconfigured',text:'Configure JEV_CONTROL_TOKEN no servidor para salvar partidas.'});return;}
    if(!token||token.length<24){this.onStatus({state:'error',text:'Informe o código JEV_CONTROL_TOKEN completo (mínimo 24 caracteres).'});return;}
    this.stop(false);this.token=token;this.enabled=true;
    sessionStorage.setItem('jev-control',token);
    this.onStatus({state:'thinking',text:this.config.ready?'Conectando à Jev pela TypeSafe...':'Memoria ativa. Piloto local em funcionamento.'});
    this.loop(this.generation);
  }
  stop(clear=true){
    this.enabled=false;this.generation++;clearTimeout(this.timer);this.abort?.abort();
    this.game.agentDecision=null;
    if(clear){this.token='';sessionStorage.removeItem('jev-control');this.onStatus({state:'ready',text:'Piloto local ativo. Jev desconectada.'});}
  }
  async loop(generation){
    if(!this.enabled||generation!==this.generation)return;
    if(this.training||!this.config?.ready||document.hidden||this.game.phase!=='combat'){
      if(this.game.agentDecision?.source==='typesafe-api')this.game.agentDecision=null;
      this.onStatus({state:'waiting',text:this.training?'Treino local: memoria conectada, sem consultas aceleradas à API.':!this.config?.ready?'Memoria ativa; IA externa indisponivel.':'Jev aguardando combate ativo.'});
      this.timer=setTimeout(()=>this.loop(generation),2000);return;
    }
    const run=this.game.runs,g=this.game,h=g.hero;
    const state={wave:g.wave,hero:{x:h.x,y:h.y,hp:h.hp,maxHp:h.maxHp,shield:h.shield,dashReady:h.dashClock===0},
      enemies:[...g.enemies].sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y)).slice(0,12).map(e=>({id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,vx:e.vx,vy:e.vy,r:e.r})),
      projectiles:g.bullets.filter(b=>!b.friendly).slice(0,12).map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy}))};
    if(!g.agentDecision)this.onStatus({state:'thinking',text:'Consultando a Jev. Piloto local mantém o combate.'});
    this.abort=new AbortController();
    const timeout=setTimeout(()=>this.abort.abort(),11500);
    let delay=2000;
    try{
      const response=await fetch('/api/jev/decision',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.token}`},body:JSON.stringify(state),signal:this.abort.signal});
      const result=await response.json();
      if(generation!==this.generation)return;
      if(response.status===401){this.stop();this.onStatus({state:'error',text:'Código de controle inválido. Piloto local ativo.'});return;}
      if(!response.ok||result.source!=='typesafe-api'||!names[result.movement])throw Error(result.error||'unavailable');
      if(run===g.runs&&g.phase==='combat'){
        g.agentDecision={...result,expiresAt:g.t+4};
        this.onStatus({state:'active',text:`${names[result.movement]} · ${result.fire?'atacar':'aguardar'} · ${Math.round(result.confidence*100)}% de confiança`,latencyMs:result.latencyMs,model:result.model});
      }
    }catch(error){
      if(generation!==this.generation)return;
      if(g.agentDecision?.source==='typesafe-api')g.agentDecision=null;delay=5000;
      const description=error.name==='AbortError'?'O pedido à Jev excedeu o tempo limite.':errorMessage[error.message]||'Jev indisponível. Verifique conexão e configuração.';
      this.onStatus({state:'error',text:description+' Piloto local mantém o combate; tentando novamente.'});
    }finally{clearTimeout(timeout);}
    if(this.enabled&&generation===this.generation)this.timer=setTimeout(()=>this.loop(generation),delay);
  }
}
