// Constant-velocity interception. Prediction is fixed when a shot is fired.
export function intercept(origin, target, speed, lifetime = 1.1) {
  const rx=target.x-origin.x,ry=target.y-origin.y;
  const vx=target.vx||0,vy=target.vy||0;
  const a=vx*vx+vy*vy-speed*speed,b=2*(rx*vx+ry*vy),c=rx*rx+ry*ry;
  let time=0;
  if(Math.abs(a)<1e-8){
    if(Math.abs(b)>1e-8)time=-c/b;
  }else{
    const discriminant=b*b-4*a*c;
    if(discriminant>=0){
      const root=Math.sqrt(discriminant);
      const candidates=[(-b-root)/(2*a),(-b+root)/(2*a)].filter(t=>t>=0);
      if(candidates.length)time=Math.min(...candidates);
    }
  }
  if(!Number.isFinite(time)||time<0||time>lifetime)time=0;
  const x=target.x+vx*time,y=target.y+vy*time;
  return {x,y,time,angle:Math.atan2(y-origin.y,x-origin.x)};
}

export function selectTarget(enemies, hero, lockedId) {
  let best=null,bestScore=Infinity,locked=null,lockedScore=Infinity;
  for(const enemy of enemies){
    if(enemy.hp<=0)continue;
    const distance=Math.hypot(enemy.x-hero.x,enemy.y-hero.y);
    const score=distance-enemy.r+(enemy.hp<=hero.damage?-24:0);
    if(score<bestScore){best=enemy;bestScore=score;}
    if(enemy.id===lockedId){locked=enemy;lockedScore=score;}
  }
  // Hysteresis avoids switching aim back and forth between equally close enemies.
  return locked&&lockedScore<=bestScore+25?locked:best;
}

export function segmentCircleHit(x0,y0,x1,y1,cx,cy,radius){
  const dx=x1-x0,dy=y1-y0,rx=x0-cx,ry=y0-cy;
  const c=rx*rx+ry*ry-radius*radius;
  if(c<=0)return 0;
  const a=dx*dx+dy*dy;
  if(a<1e-12)return null;
  const b=2*(rx*dx+ry*dy),disc=b*b-4*a*c;
  if(disc<0)return null;
  const t=(-b-Math.sqrt(disc))/(2*a);
  return t>=0&&t<=1?t:null;
}
