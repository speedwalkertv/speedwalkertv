import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createVoiceHandler } from '../src/voice.js';

test('Narração protege a chave e usa ElevenLabs quando configurada',async()=>{
  const token='this-is-a-long-voice-token';
  let requests=0;
  const handler=createVoiceHandler({env:{ELEVENLABS_API_KEY:'private-key',ELEVENLABS_VOICE_ID:'a1b2c3d4e5f6g7h8',JEV_CONTROL_TOKEN:token},
    fetchImpl:async(url,opts)=>{
      requests++;
      assert.match(url,/api\.elevenlabs\.io/);
      assert.equal(opts.headers['xi-api-key'],'private-key');
      assert.equal(JSON.parse(opts.body).text,'Fogo na arena!');
      return {ok:true,arrayBuffer:async()=>new Uint8Array([255,251,144,100]).buffer};
    }});
  const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const status=await (await fetch(base+'/api/voice/status')).json();
    assert.equal(status.ready,true);
    assert.ok(!JSON.stringify(status).includes('private-key'));
    const options={method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({text:'Fogo na arena!'})};
    assert.equal((await fetch(base+'/api/voice/speak',{...options,headers:{Authorization:'Bearer wrong'}})).status,401);
    assert.equal((await fetch(base+'/api/voice/speak',{...options,headers:{...options.headers,Origin:'https://evil.com'}})).status,403);
    const response=await fetch(base+'/api/voice/speak',options);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/audio\/mpeg/);
    assert.equal((await response.arrayBuffer()).byteLength,4);
    assert.equal((await fetch(base+'/api/voice/speak',options)).status,200);
    assert.equal(requests,1,'O cache evita chamadas repetidas à API');
  } finally {await new Promise(resolve=>server.close(resolve));}
});
