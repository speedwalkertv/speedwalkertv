import { timingSafeEqual } from 'node:crypto';

export const MOVES = ['approach','retreat','orbit_left','orbit_right','hold','north','south','east','west'];
const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;
const point=p=>({x:number(p?.x,0,720),y:number(p?.y,0,1280)});
export function observation(raw){
  if(!raw?.hero||!Array.isArray(raw.enemies))throw new Error('invalid_state');
  return {
    arena:{width:720,height:1280,bounds:{left:89,right:631,top:427,bottom:1128},yIncreasesDownward:true},
    hero:{...point(raw.hero),hp:number(raw.hero.hp,0,100000),maxHp:number(raw.hero.maxHp,1,100000),shield:number(raw.hero.shield,0,100000),dashReady:raw.hero.dashReady===true},
    wave:number(raw.wave,1,10000),
    enemies:raw.enemies.slice(0,12).map(e=>({id:String(Math.trunc(number(e.id,1,1e9))),type:['slime','hunter','tank','boss'].includes(e.type)?e.type:'slime',...point(e),hp:number(e.hp,0,1e6),vx:number(e.vx,-500,500),vy:number(e.vy,-500,500),radius:number(e.r,0,100)})),
    projectiles:(Array.isArray(raw.projectiles)?raw.projectiles:[]).slice(0,12).map(b=>({...point(b),vx:number(b.vx,-1000,1000),vy:number(b.vy,-1000,1000)}))
  };
}
export function requestFor(state,model){
  return {model,state,questions:{
    target:{type:'choice',instructions:'Choose the enemy to shoot now. Prioritize imminent threats and easy eliminations; keep a safe distance. IDs refer to enemies in state.',criteria:Object.fromEntries([['nearest','Nearest living threat'],...state.enemies.map(e=>[e.id,`${e.type} at (${e.x},${e.y}), HP ${e.hp}`])])},
    movement:{type:'choice',instructions:'Choose one movement for the next two seconds. Survive, avoid incoming projectiles and enemy contact, remain inside arena bounds. Approach only when enemies are too far; retreat when surrounded or low on health. Orbit choices move around the selected target.',criteria:{approach:'Move toward the target',retreat:'Move away from the target',orbit_left:'Circle counterclockwise around the target',orbit_right:'Circle clockwise around the target',hold:'Stay in place',north:'Move up',south:'Move down',east:'Move right',west:'Move left'}},
    fire:{type:'noul',instructions:'Firing at the selected enemy now is useful. Shots cost no ammunition.'},
    dash:{type:'noul',instructions:'Use the available dash now to evade immediate danger. Dash has a cooldown, so avoid wasting it. False if dashReady is false.'}
  }};
}
export function decisionFrom(response,state){
  const a=response?.answers;
  if(!a||!MOVES.includes(a.movement?.choice)||!['nearest',...state.enemies.map(e=>e.id)].includes(a.target?.choice))throw new Error('invalid_response');
  if(!Number.isFinite(a.fire?.noul)||!Number.isFinite(a.dash?.noul))throw new Error('invalid_response');
  return {targetId:a.target.choice==='nearest'?null:Number(a.target.choice),movement:a.movement.choice,fire:a.fire.noul>=.5,dash:a.dash.noul>=.7,
    confidence:number(a.movement.confidence,0,1),model:typeof response.model==='string'?response.model.slice(0,60):'jev'};
}

export function createJevHandler({env=process.env,fetchImpl=fetch,now=Date.now}={}){
  const key=env.TYPESAFE_API_KEY?.trim(),token=env.JEV_CONTROL_TOKEN?.trim();
  const ready=Boolean(key&&token&&token.length>=24),model=env.JEV_MODEL||'jev-latest';
  let busy=false,nextAt=0,hourAt=now(),calls=0;
  const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/jev/'))return false;
    if(url.pathname==='/api/jev/status'&&req.method==='GET'){send(res,200,{ready,provider:'TypeSafe',model,intervalMs:2000});return true;}
    if(url.pathname!=='/api/jev/decision'||req.method!=='POST'){send(res,404,{error:'not_found'});return true;}
    if(!ready){send(res,503,{error:'not_configured'});return true;}
    const provided=String(req.headers.authorization||'').replace(/^Bearer /,'');
    const a=Buffer.from(provided),b=Buffer.from(token);
    if(a.length!==b.length||!timingSafeEqual(a,b)){send(res,401,{error:'unauthorized'});return true;}
    if(req.headers.origin){
      try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}
      catch{send(res,403,{error:'origin_denied'});return true;}
    }
    if(now()-hourAt>=3600000){hourAt=now();calls=0;}
    if(busy||now()<nextAt||calls>=1800){send(res,429,{error:'rate_limit'});return true;}
    // Lock before reading the body to prevent parallel callers from bypassing the quota.
    busy=true;
    const bodyTimer=setTimeout(()=>req.destroy(),4000);
    try{
      let body='',bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>16000)throw Error('body_too_large');body+=chunk.toString();}
      clearTimeout(bodyTimer);
      const state=observation(JSON.parse(body));
      nextAt=now()+2000;calls++;
      const started=now();
      const response=await fetchImpl('https://api.typesafe.ai/v1/systemone',{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify(requestFor(state,model)),signal:AbortSignal.timeout(2500)
      });
      if(!response.ok){nextAt=now()+10000;send(res,502,{error:response.status===401?'provider_auth':'provider_unavailable'});return true;}
      const data=decisionFrom(await response.json(),state);
      send(res,200,{...data,latencyMs:now()-started,source:'typesafe-api'});
    }catch(error){
      const input=['invalid_state','body_too_large'].includes(error.message)||error instanceof SyntaxError;
      if(!input)nextAt=now()+5000;
      send(res,input?400:502,{error:input?'invalid_state':'decision_unavailable'});
    }finally{clearTimeout(bodyTimer);busy=false;}
    return true;
  };
}
