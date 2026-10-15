import test from 'node:test';
import assert from 'node:assert/strict';
import {intercept,selectTarget,segmentCircleHit} from '../public/npc/combat-ai.js';

test('mira intercepta alvo lateral a partir da origem real do projetil',()=>{
  const origin={x:385,y:789},target={x:510,y:640,vx:-45,vy:98};
  const aim=intercept(origin,target,550);
  assert.ok(aim.time>0);
  const bullet={x:origin.x+Math.cos(aim.angle)*550*aim.time,y:origin.y+Math.sin(aim.angle)*550*aim.time};
  assert.ok(Math.hypot(bullet.x-(target.x+target.vx*aim.time),bullet.y-(target.y+target.vy*aim.time))<1e-6);
});
test('mira trata alvo parado, coincidente e rapido demais sem NaN',()=>{
  for(const target of [{x:0,y:0},{x:120,y:80},{x:120,y:0,vx:800,vy:0}]){
    const aim=intercept({x:0,y:0},target,550);
    assert.ok(Number.isFinite(aim.angle));assert.ok(Number.isFinite(aim.time));
  }
});
test('colisao varrida detecta inimigo atravessado entre quadros',()=>{
  const hit=segmentCircleHit(0,0,100,0,50,0,8);
  assert.ok(hit>.4&&hit<.5);
  assert.equal(segmentCircleHit(0,20,100,20,50,0,8),null);
  assert.equal(segmentCircleHit(50,0,50,0,50,0,8),0);
});
test('IA mantem alvo proximo e troca para uma ameaca claramente mais perto',()=>{
  const hero={x:0,y:0,damage:23};
  const enemies=[{id:1,x:100,y:0,r:18,hp:100},{id:2,x:90,y:0,r:18,hp:100}];
  assert.equal(selectTarget(enemies,hero,1).id,1);
  enemies[1].x=30;
  assert.equal(selectTarget(enemies,hero,1).id,2);
});
