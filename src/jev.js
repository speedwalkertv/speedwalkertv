import { timingSafeEqual } from 'node:crypto';
import { createBrain } from './jev-brain.js';

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
export function requestFor(state,model,policy,notes=''){
  return {model,state:{...state,objective:{minimumWave:8,targetWave:Math.max(8,(policy?.bestWave||0)+1),
    priorities:['survive','avoid_projectiles_and_contact','eliminate_enemies','advance_waves'],
    reference:{wave:7,kills:175,score:27378}}},...(policy?.matches ? {memory:{matches:policy.matches,bestWave:policy.bestWave,
    survivalRules:policy.contexts,repeatedDeathContexts:policy.mistakes,notes:notes.slice(0,4000)}} : notes ? {memory:{notes:notes.slice(0,4000)}} : {}),questions:{
    target:{type:'choice',instructions:'Choose the enemy to shoot now. Prioritize imminent threats and easy eliminations; keep a safe distance. IDs refer to enemies in state.',criteria:Object.fromEntries([['nearest','Nearest living threat, if there is one'],['none','No living enemy currently available'],...state.enemies.map(e=>[e.id,`${e.type} at (${e.x},${e.y}), HP ${e.hp}`])])},
    movement:{type:'choice',instructions:'Choose one movement for the next two seconds. Reach state.objective.targetWave and keep advancing. Use remembered mistakes as evidence, not absolute prohibitions. Predict incoming projectile positions from their velocities and avoid being trapped against walls. Survive, avoid incoming projectiles and enemy contact, remain inside arena bounds. Approach only when enemies are too far; retreat when surrounded or low on health. Orbit choices move around the selected target.',criteria:{approach:'Move toward the target',retreat:'Move away from the target',orbit_left:'Circle counterclockwise around the target',orbit_right:'Circle clockwise around the target',hold:'Stay in place',north:'Move up',south:'Move down',east:'Move right',west:'Move left'}},
    fire:{type:'noul',instructions:'Firing at the selected enemy now is useful. Shots cost no ammunition.'},
    dash:{type:'noul',instructions:'Use the available dash now to evade immediate danger. Dash has a cooldown, so avoid wasting it. False if dashReady is false.'}
  }};
}
export function decisionFrom(response,state){
  const a=response?.answers;
  if(!a||!MOVES.includes(a.movement?.choice)||!['nearest','none',...state.enemies.map(e=>e.id)].includes(a.target?.choice))throw new Error('invalid_response');
  if(!Number.isFinite(a.fire?.noul)||!Number.isFinite(a.dash?.noul))throw new Error('invalid_response');
  return {targetId:['nearest','none'].includes(a.target.choice)?null:Number(a.target.choice),movement:a.movement.choice,fire:a.fire.noul>=.5,dash:a.dash.noul>=.7,
    confidence:number(a.movement.confidence,0,1),model:typeof response.model==='string'?response.model.slice(0,60):'jev'};
}

export function createJevHandler({env=process.env,fetchImpl=fetch,now=Date.now,brain=createBrain({env})}={}){
  const key=env.TYPESAFE_API_KEY?.trim(),token=env.JEV_CONTROL_TOKEN?.trim();
  const configuration=!key?'missing_api_key':!token?'missing_control_token':token.length<24?'control_token_too_short':'ok';
  const ready=configuration==='ok',memoryReady=Boolean(token&&token.length>=24),model=env.JEV_MODEL||'jev-latest';
  let busy=false,nextAt=0,hourAt=now(),calls=0;
  const send=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const readJson=async(req,maxBytes)=>{
    let body='',bytes=0;
    const timer=setTimeout(()=>req.destroy(),8000);
    try {
      for await(const chunk of req){bytes+=chunk.length;if(bytes>maxBytes)throw Error('body_too_large');body+=chunk.toString();}
    } finally {clearTimeout(timer);}
    return JSON.parse(body);
  };
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/jev/'))return false;
    if(url.pathname==='/api/jev/status'&&req.method==='GET'){
      const policy=await brain.getPolicy().catch(()=>({matches:0}));
      send(res,200,{ready,memoryReady,configuration,provider:'TypeSafe',model,intervalMs:2000,matchesLearned:policy.matches});return true;
    }
    if(url.pathname==='/api/jev/policy'&&req.method==='GET'){
      try{send(res,200,await brain.getPolicy());}catch{send(res,503,{error:'brain_unavailable'});}return true;
    }
    const isMemory=url.pathname.startsWith('/api/jev/memory/');
    if(!isMemory&&(url.pathname!=='/api/jev/decision'||req.method!=='POST')){send(res,404,{error:'not_found'});return true;}
    if(isMemory&&!memoryReady){send(res,503,{error:'missing_control_token'});return true;}
    if(!isMemory&&!ready){send(res,503,{error:'not_configured',configuration});return true;}
    const provided=String(req.headers.authorization||'').replace(/^Bearer /,'');
    const a=Buffer.from(provided),b=Buffer.from(token);
    if(a.length!==b.length||!timingSafeEqual(a,b)){send(res,401,{error:'unauthorized'});return true;}
    if(req.headers.origin){
      try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}
      catch{send(res,403,{error:'origin_denied'});return true;}
    }
    if(isMemory){
      if(url.pathname==='/api/jev/memory/export'&&req.method==='GET'){
        try{send(res,200,{version:1,matches:await brain.getRecent(2000),policy:await brain.getPolicy(),notes:await brain.getNotes()});}
        catch{send(res,503,{error:'brain_unavailable'});}
        return true;
      }
      if(url.pathname==='/api/jev/memory/dashboard'&&req.method==='GET'){
        try{send(res,200,await brain.getDashboard());}catch{send(res,503,{error:'brain_unavailable'});}
        return true;
      }
      if(url.pathname==='/api/jev/memory/notes'&&req.method==='PUT'){
        try{
          const input=await readJson(req,18000);
          await brain.editNotes(input?.notes);
          send(res,200,{saved:true});
        }catch(error){send(res,['invalid_notes','body_too_large'].includes(error.message)||error instanceof SyntaxError?400:503,
          {error:error.message==='invalid_notes'?'invalid_notes':'brain_write_failed'});}
        return true;
      }
      if(url.pathname==='/api/jev/memory/import'&&req.method==='POST'){
        try{
          const input=await readJson(req,6000000);
          const result=await brain.importMemory(input);
          send(res,200,{saved:true,added:result.added,matchesLearned:result.policy.matches});
        }catch(error){send(res,['invalid_import','body_too_large'].includes(error.message)||error instanceof SyntaxError?400:503,
          {error:error.message==='invalid_import'?'invalid_import':'brain_import_failed'});}
        return true;
      }
      if(url.pathname!=='/api/jev/memory/match'||req.method!=='POST'){send(res,405,{error:'method_not_allowed'});return true;}
      try{
        const result=await brain.save(await readJson(req,600000));
        send(res,200,{saved:true,duplicate:result.duplicate,id:result.id,matchesLearned:result.policy.matches});
      }catch(error){
        send(res,['invalid_match','body_too_large'].includes(error.message)||error instanceof SyntaxError?400:503,
          {error:['invalid_match','body_too_large'].includes(error.message)||error instanceof SyntaxError?'invalid_match':'brain_write_failed'});
      }
      return true;
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
        body:JSON.stringify(requestFor(state,model,await brain.getPolicy().catch(()=>null),await brain.getNotes().catch(()=>''))),signal:AbortSignal.timeout(9000)
      });
      if(!response.ok){
        nextAt=now()+10000;
        const errors={400:'provider_bad_request',401:'provider_auth',403:'provider_auth',402:'provider_no_credits',404:'provider_model_unavailable',429:'provider_rate_limited'};
        send(res,502,{error:errors[response.status]||'provider_unavailable',providerStatus:response.status});return true;
      }
      let data;
      try{data=decisionFrom(await response.json(),state);}
      catch{nextAt=now()+5000;send(res,502,{error:'provider_invalid_response'});return true;}
      send(res,200,{...data,latencyMs:now()-started,source:'typesafe-api'});
    }catch(error){
      const input=['invalid_state','body_too_large'].includes(error.message)||error instanceof SyntaxError;
      if(!input)nextAt=now()+5000;
      send(res,input?400:502,{error:input?'invalid_state':error.name==='TimeoutError'?'provider_timeout':'decision_unavailable'});
    }finally{clearTimeout(bodyTimer);busy=false;}
    return true;
  };
}
