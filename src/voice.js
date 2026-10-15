import { timingSafeEqual } from 'node:crypto';

export function createVoiceHandler({env=process.env,fetchImpl=fetch,now=Date.now}={}){
  const key=env.ELEVENLABS_API_KEY?.trim();
  const voiceId=env.ELEVENLABS_VOICE_ID?.trim();
  const token=env.JEV_CONTROL_TOKEN?.trim();
  const ready=Boolean(key&&voiceId&&/^[a-zA-Z0-9]{10,60}$/.test(voiceId)&&token&&token.length>=24);
  const cache=new Map();
  let used=0,period=now(),busy=false;
  const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  return async(req,res,url)=>{
    if(!url.pathname.startsWith('/api/voice/'))return false;
    if(url.pathname==='/api/voice/status'&&req.method==='GET'){
      json(res,200,{ready,provider:ready?'ElevenLabs':'browser'});return true;
    }
    if(url.pathname!=='/api/voice/speak'||req.method!=='POST'){
      json(res,404,{error:'not_found'});return true;
    }
    if(!ready){json(res,503,{error:'voice_not_configured'});return true;}
    const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
    const a=Buffer.from(supplied),b=Buffer.from(token);
    if(a.length!==b.length||!timingSafeEqual(a,b)){
      json(res,401,{error:'unauthorized'});return true;
    }
    if(req.headers.origin){
      try{if(new URL(req.headers.origin).host!==req.headers.host)throw Error();}
      catch{json(res,403,{error:'origin_denied'});return true;}
    }
    try{
      let bytes=0,body='';
      for await(const chunk of req){bytes+=chunk.length;if(bytes>1000)throw Error('invalid_text');body+=chunk.toString();}
      const text=JSON.parse(body)?.text;
      if(typeof text!=='string'||text.length<1||text.length>220)throw Error('invalid_text');
      if(cache.has(text)){
        res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, max-age=3600'});
        res.end(cache.get(text));return true;
      }
      if(now()-period>=60000){period=now();used=0;}
      if(busy||used>=12){json(res,429,{error:'voice_rate_limit'});return true;}
      busy=true;used++;
      try{
        const response=await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,{
          method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},
          body:JSON.stringify({text,model_id:env.ELEVENLABS_MODEL||'eleven_multilingual_v2'}),
          signal:AbortSignal.timeout(18000)
        });
        if(!response.ok){json(res,502,{error:'voice_provider_unavailable',providerStatus:response.status});return true;}
        const sound=Buffer.from(await response.arrayBuffer());
        if(!sound.length||sound.length>2_000_000){json(res,502,{error:'voice_invalid_audio'});return true;}
        cache.set(text,sound);
        if(cache.size>35)cache.delete(cache.keys().next().value);
        res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, max-age=3600'});
        res.end(sound);
      }finally{busy=false;}
    }catch(error){json(res,error.message==='invalid_text'||error instanceof SyntaxError?400:502,
      {error:error.message==='invalid_text'?'invalid_text':'voice_unavailable'});}
    return true;
  };
}
