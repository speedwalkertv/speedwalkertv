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
 assert.equal((await fetch(url+'/api/jev/decision',{method:'POST'})).status,401);assert.equal(calls,0);
 const options={method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({hero:{x:300,y:700,hp:100,maxHp:160},enemies:[],chat:'untrusted text'})};
 const result=await (await fetch(url+'/api/jev/decision',options)).json();assert.equal(result.movement,'retreat');assert.equal(result.source,'typesafe-api');assert.equal(sent.state.chat,undefined);
 assert.equal((await fetch(url+'/api/jev/decision',options)).status,429);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
