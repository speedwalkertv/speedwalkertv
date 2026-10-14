import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createJevHandler } from '../src/jev.js';
import { createBrain } from '../src/jev-brain.js';

function match(id, movement='retreat') {
  return {
    id, outcome:'dead', duration:18, wave:2, kills:1, score:150,
    damageTaken:3, hitsTaken:1, shots:10, shotsHit:5, projectileHits:1,
    frames:Array.from({length:17},(_,i)=>({
      t:i*.75, movement, source:'learned-local',hpRatio:.8,
      nearestDistance:75,closeEnemies:1,projectiles:0,
      hitsTaken:i===16?1:0,damageTaken:i===16?3:0,
      kills:i>=12?1:0,wave:1
    }))
  };
}

test('Jev aprende, grava no cofre, recupera, importa e preserva backup', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'jev-integration-'));
  try {
    const brain=createBrain({root});
    const first=await brain.save(match('test-match-0001'));
    assert.equal(first.duplicate,false);
    assert.equal((await brain.save(match('test-match-0001'))).duplicate,true);
    assert.equal((await brain.getPolicy()).matches,1);
    assert.equal((await brain.getPolicy()).contexts.normal.movement,'retreat');
    assert.match(await readFile(path.join(root,'04 - Partidas','test-match-0001.md'),'utf8'),/Dano recebido/);
    assert.equal((await createBrain({root}).getPolicy()).matches,1);
    await brain.editNotes('Desviar de projeteis; sobreviver.');
    assert.equal(await createBrain({root}).getNotes(),'Desviar de projeteis; sobreviver.');
    const backup={matches:[match('test-match-0002','orbit_left')],notes:'Nova estrategia',mode:'merge'};
    assert.equal((await brain.importMemory(backup)).added,1);
    assert.equal((await brain.getDashboard()).recent.length,2);
    assert.equal((await brain.importMemory({...backup,mode:'replace'})).added,1);
    assert.equal((await brain.getPolicy()).matches,1);
    assert.equal(await brain.getNotes(),'Nova estrategia');
    assert.equal((await createBrain({root}).getRecent()).length,1);
    const files=await import('node:fs/promises').then(fs=>fs.readdir(path.join(root,'09 - Backups')));
    assert.equal(files.length,1);
    assert.equal((await readFile(path.join(root,'08 - Modelos','politica-jev.json'),'utf8')).includes('orbit_left'),true);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('Jev exige autorizacao nas rotas de memoria e publica estado correto', async () => {
  const root=await mkdtemp(path.join(os.tmpdir(),'jev-http-'));
  const token='jev-test-very-long-private-token';
  const handler=createJevHandler({env:{JEV_CONTROL_TOKEN:token},brain:createBrain({root})});
  const server=http.createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const auth={Authorization:'Bearer '+token};
  try {
    const status=await (await fetch(base+'/api/jev/status')).json();
    assert.equal(status.ready,false);
    assert.equal(status.memoryReady,true);
    assert.equal(status.matchesLearned,0);
    assert.equal((await fetch(base+'/api/jev/memory/dashboard')).status,401);
    assert.equal((await fetch(base+'/api/jev/memory/dashboard',{headers:{...auth,Origin:'https://other.site'}})).status,403);
    const post=await fetch(base+'/api/jev/memory/match',{method:'POST',headers:auth,body:JSON.stringify(match('test-match-0003'))});
    assert.equal(post.status,200);
    assert.equal((await post.json()).matchesLearned,1);
    const notes=await fetch(base+'/api/jev/memory/notes',{method:'PUT',headers:auth,body:JSON.stringify({notes:'Conservar escudo'})});
    assert.equal(notes.status,200);
    const dashboard=await (await fetch(base+'/api/jev/memory/dashboard',{headers:auth})).json();
    assert.equal(dashboard.policy.matches,1);
    assert.equal(dashboard.notes,'Conservar escudo');
    const exported=await (await fetch(base+'/api/jev/memory/export',{headers:auth})).json();
    assert.equal(exported.matches.length,1);
    assert.equal(exported.matches[0].frames.length,17);
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(root,{recursive:true,force:true}); }
});
