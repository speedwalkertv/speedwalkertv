// Visual-only layers: they never move collision bodies or delay LIVE events.
const TAU = Math.PI * 2;
const clamp = (n,a=0,b=1) => Math.max(a,Math.min(b,n));
const easeOut = n => 1-(1-n)**3;
const lights = new Map();

export function glow(ctx,x,y,r,color,alpha=.5) {
  let texture=lights.get(color);
  if(!texture){
    texture=document.createElement('canvas');texture.width=texture.height=128;
    const c=texture.getContext('2d'),g=c.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,color);g.addColorStop(.25,color+'a0');g.addColorStop(1,color+'00');
    c.fillStyle=g;c.fillRect(0,0,128,128);lights.set(color,texture);
  }
  ctx.save();ctx.globalAlpha*=clamp(alpha);ctx.drawImage(texture,x-r,y-r,r*2,r*2);ctx.restore();
}
function stroke(ctx,color,width,points){
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function circle(ctx,x,y,r,color,width=2){
  ctx.beginPath();ctx.arc(x,y,Math.max(.1,r),0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function shard(ctx,x,y,size,angle,color){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.beginPath();
  ctx.moveTo(0,-size);ctx.lineTo(size*.3,0);ctx.lineTo(0,size*.65);ctx.lineTo(-size*.3,0);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();
}
function glyph(ctx,x,y,r,color,t,alpha=1){
  ctx.save();ctx.translate(x,y);ctx.scale(1,.42);ctx.rotate(t);ctx.globalAlpha*=alpha;
  circle(ctx,0,0,r,color,3);circle(ctx,0,0,r*.83,color,1);
  for(let i=0;i<12;i++){
    const a=i*TAU/12;
    stroke(ctx,color,2,[[Math.cos(a)*r*.88,Math.sin(a)*r*.88],[Math.cos(a)*r*.97,Math.sin(a)*r*.97]]);
  }
  ctx.beginPath();for(let i=0;i<=6;i++){const a=i*TAU/6; i?ctx.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75):ctx.moveTo(r*.75,0);}
  ctx.strokeStyle=color;ctx.lineWidth=1;ctx.stroke();ctx.restore();
}

export function groundVfx(ctx,arena,reduced=false){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const v of arena.visuals){
    const p=clamp(1-v.ttl/v.max),a=Math.sin(p*Math.PI),x=v.follow?arena.hero.x:v.x,y=v.follow?arena.hero.y:v.y;
    if(['spawn','summon','heal','berserk','ultimate'].includes(v.kind)){
      const color=v.color||({heal:'#60ffcd',berserk:'#bd85ff',ultimate:'#ffe4a1',summon:'#ffe4a1'}[v.kind])||'#76e7ff';
      glyph(ctx,x,y+35,(v.radius||110)*(.5+easeOut(p)*.5),color,arena.t*.5,a*(reduced?.35:.7));
    }
    if(v.kind==='fire'){
      ctx.save();ctx.globalAlpha=(1-p)*.65;
      ctx.translate(x,y);ctx.scale(1,.6);
      circle(ctx,0,0,30+easeOut(p)*240,'#ff9b55',8*(1-p)+1);ctx.restore();
    }
  }
  for(const f of arena.flares){
    if(f.kind!=='freeze')continue;
    glyph(ctx,f.x,f.y,270,'#91dfff',-arena.t*.15,Math.min(1,f.ttl)*.45);
  }
  for(const e of arena.enemies){
    if(e.type!=='boss'||e.attackClock>.7)continue;
    const p=1-e.attackClock/.7;
    ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.aim);
    ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,240,-.68,.68);ctx.closePath();
    ctx.fillStyle=`rgba(255,93,58,${.05+p*.12})`;ctx.fill();
    ctx.strokeStyle='#ff9b7777';ctx.lineWidth=2;ctx.stroke();ctx.restore();
    glyph(ctx,e.x,e.y+35,90,'#ff865b',-arena.t,p*.8);
  }
  ctx.restore();
}

export function foregroundVfx(ctx,arena,reduced=false){
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const v of arena.visuals){
    const p=clamp(1-v.ttl/v.max),fade=1-p;
    const x=v.follow?arena.hero.x:v.x,y=v.follow?arena.hero.y:v.y;
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=reduced?.55:1;
    if(v.kind==='slash'){
      ctx.rotate(v.angle);ctx.scale(1,v.flip?-1:1);
      const sweep=-1.4+easeOut(p)*2.6,r=80+p*35;
      for(let layer=0;layer<3;layer++){
        ctx.beginPath();ctx.ellipse(10,0,r,r*.7,0,sweep-1.3,sweep);
        ctx.strokeStyle=['#35cfd24a','#64fbe7a0','#e5fff8'][layer];
        ctx.lineWidth=[24,10,2][layer]*fade;ctx.stroke();
      }
      glow(ctx,Math.cos(sweep)*r+10,Math.sin(sweep)*r*.7,30,'#7ffff1',fade*.7);
    }else if(v.kind==='hit'||v.kind==='death'){
      const death=v.kind==='death',r=death?v.radius:38,col=v.color||'#ffe4a1';
      glow(ctx,0,0,r*1.2,col,fade*(death?.6:.75));
      circle(ctx,0,0,5+easeOut(p)*r,col,Math.max(1,5*fade));
      const count=reduced?5:death?16:7;
      for(let i=0;i<count;i++){
        const a=i*TAU/count+(v.angle||0),d=(8+easeOut(p)*r);
        shard(ctx,Math.cos(a)*d,Math.sin(a)*d,fade*(death?16:11),a+Math.PI/2,col);
      }
    }else if(v.kind==='heal'){
      for(let i=0;i<(reduced?5:12);i++){
        const phase=(p+i/12)%1,a=i*2.4+arena.t*.5;
        const px=Math.cos(a)*(30+phase*30),py=30-phase*140;
        ctx.globalAlpha=(1-phase)*Math.sin(p*Math.PI)*(reduced?.5:.9);
        stroke(ctx,'#a3ffdc',3,[[px-4,py],[px+4,py]]);stroke(ctx,'#a3ffdc',3,[[px,py-4],[px,py+4]]);
      }
    }else if(v.kind==='fire'){
      for(let i=0;i<(reduced?9:22);i++){
        const a=i*TAU/22,r=20+easeOut(p)*240,px=Math.cos(a)*r,py=Math.sin(a)*r*.65;
        glow(ctx,px,py-20*fade,28+fade*24,'#ff893e',fade*.7);
        shard(ctx,px,py-20,35*fade,-.2+Math.sin(i),i%2?'#ffbd67':'#ff5d42');
      }
    }else if(v.kind==='meteor'){
      for(let i=0;i<(reduced?3:7);i++){
        const q=clamp(p*1.55-i*.075),tx=(i*137%440)-220,ty=(i*91%260)-80;
        if(q<=0)continue;
        if(q<.5){
          const z=q*2,mx=tx-(1-z)*210,my=ty-(1-z)*500;
          stroke(ctx,'#ff6c3935',27,[[mx-44,my-110],[mx,my]]);
          stroke(ctx,'#ffc278',7,[[mx-30,my-75],[mx,my]]);
          glow(ctx,mx,my,45,'#ff9c52',.8);shard(ctx,mx,my,14,-.4,'#fff3c0');
        }else{
          const z=(q-.5)*2;ctx.save();ctx.globalAlpha*=1-z;
          glow(ctx,tx,ty,85,'#ff9c52',.7);
          ctx.translate(tx,ty);ctx.scale(1,.5);circle(ctx,0,0,12+easeOut(z)*85,'#ffb67b',6*(1-z)+1);ctx.restore();
        }
      }
    }else if(v.kind==='ultimate'){
      const a=Math.sin(p*Math.PI),r=75+easeOut(p)*150;
      glow(ctx,0,-30,235,'#ffe4a1',a*.32);
      ctx.save();ctx.rotate(p*.8);ctx.globalAlpha*=a;
      for(let i=0;i<12;i++){
        const angle=i*TAU/12;
        shard(ctx,Math.cos(angle)*r,Math.sin(angle)*r*.8,18+12*a,angle,'#fff0c1');
      }
      circle(ctx,0,-20,r,'#ffe4a1',3);circle(ctx,0,-20,r*.87,'#fff7d4',1);ctx.restore();
      if(!reduced){
        const g=ctx.createLinearGradient(0,-420,0,45);g.addColorStop(0,'#fff0c100');g.addColorStop(1,`rgba(255,234,172,${a*.25})`);
        ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-25,-420);ctx.lineTo(25,-420);ctx.lineTo(65,45);ctx.lineTo(-65,45);ctx.fill();
      }
    }else if(v.kind==='lightning'){
      ctx.globalAlpha*=fade;
      for(let j=0;j<(reduced?3:6);j++){
        const a=j*TAU/6;const pts=[[0,-20]];
        for(let i=1;i<=6;i++){const d=i*30,off=Math.sin(i*7+j*3+Math.floor(p*6))*15;pts.push([Math.cos(a)*d-Math.sin(a)*off,Math.sin(a)*d+Math.cos(a)*off-20]);}
        stroke(ctx,'#55b9ff44',10,pts);stroke(ctx,'#c8fbff',2,pts);
      }
    }else if(v.kind==='berserk'){
      const a=Math.min(1,v.ttl)*Math.min(1,p*8);
      glow(ctx,0,-35,120,'#be83ff',a*.25);
      for(let i=0;i<(reduced?3:7);i++){
        const q=(arena.t*.65+i/7)%1;
        shard(ctx,Math.sin(i*2.3+arena.t)*50,40-q*155,10*(1-q),.1,'#d1a4ff');
      }
    }else if(v.kind==='bossAttack'){
      ctx.rotate(v.angle);ctx.globalAlpha*=fade;
      for(let i=-3;i<=3;i++){
        const a=i*.19,d=25+easeOut(p)*100;
        shard(ctx,Math.cos(a)*d,Math.sin(a)*d,22*fade,a+Math.PI/2,'#ffb475');
      }
    }else if(v.kind==='summon'){
      glow(ctx,0,-30,100,'#ffe4a1',Math.sin(p*Math.PI)*.4);
      for(let i=0;i<8;i++){const a=i*TAU/8+p*3;shard(ctx,Math.cos(a)*55,Math.sin(a)*35-p*50,8*fade,a,'#fff0c1');}
    }
    ctx.restore();
  }
  // Crystal fragments remain anchored to the actual freeze area.
  for(const f of arena.flares){
    if(f.kind!=='freeze')continue;
    ctx.save();ctx.globalAlpha=Math.min(1,f.ttl)*.8;
    for(let i=0;i<(reduced?6:16);i++){
      const a=i*TAU/16,r=175+Math.sin(i*8)*55;
      shard(ctx,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,15+Math.sin(i)*8,Math.sin(i)*.5,'#a5edff');
    }ctx.restore();
  }
  ctx.restore();
}
