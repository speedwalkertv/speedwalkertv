import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createJevHandler} from '../src/jev.js';
test('Jev protege credenciais, consulta provedor e aplica limites',async()=>{
 let sent,calls=0;
 const token='test-control-token-123456789';
 const handler=createJevHandler({env:{TYPESAFE_API_KEY:'private-test-key',JEV_CONTROL_TOKEN:token},fetchImpl:async(url,options)=>{calls++;sent=JSON.parse(options.body);assert.equal(url,'https://api.typesafe.ai/v1/systemone');return {ok:true,json:async()=>({model:'jev-test',answers:{movement:{choice:'retreat',confidence:.9},target:{choice:'nearest'},fire:{noul:1},dash:{noul:0}}})};}});
 const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 try {
 const status=await (await fetch(url+'/api/jev/status')).json();assert.equal(status.ready,true);assert.ok(!JSON.stringify(status).includes('private-test-key'));
 assert.equal(status.configuration,'ok');
 assert.equal((await fetch(url+'/api/jev/decision',{method:'POST'})).status,401);assert.equal(calls,0);
 const options={method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({hero:{x:300,y:700,hp:100,maxHp:160},enemies:[],chat:'untrusted text'})};
 const result=await (await fetch(url+'/api/jev/decision',options)).json();assert.equal(result.movement,'retreat');assert.equal(result.source,'typesafe-api');assert.equal(sent.state.chat,undefined);
 assert.equal((await fetch(url+'/api/jev/decision',options)).status,429);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('Jev diagnostica configuracao incompleta sem expor segredos',async()=>{
  for(const [env,expected] of [
    [{JEV_CONTROL_TOKEN:'123456789012345678901234'},'missing_api_key'],
    [{TYPESAFE_API_KEY:'secret-key'},'missing_control_token'],
    [{TYPESAFE_API_KEY:'secret-key',JEV_CONTROL_TOKEN:'short'},'control_token_too_short']
  ]){
    const handler=createJevHandler({env});
    const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const body=await (await fetch('http://127.0.0.1:'+server.address().port+'/api/jev/status')).text();
      const status=JSON.parse(body);
      assert.equal(status.ready,false);
      assert.equal(status.configuration,expected);
      assert.ok(!body.includes('secret-key'));
      assert.ok(!body.includes('123456789012345678901234'));
    }finally{await new Promise(resolve=>server.close(resolve));}
  }
});

test('Jev explica recusa da TypeSafe sem transmitir resposta sensivel',async()=>{
  const handler=createJevHandler({env:{TYPESAFE_API_KEY:'secret',JEV_CONTROL_TOKEN:'this-is-a-long-private-token'},fetchImpl:async()=>({ok:false,status:402})});
  const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/jev/decision',{
      method:'POST',headers:{Authorization:'Bearer this-is-a-long-private-token','Content-Type':'application/json'},
      body:JSON.stringify({hero:{x:320,y:800},enemies:[]})
    });
    assert.equal(response.status,502);
    assert.deepEqual(await response.json(),{error:'provider_no_credits',providerStatus:402});
  }finally{await new Promise(resolve=>server.close(resolve));}
});
