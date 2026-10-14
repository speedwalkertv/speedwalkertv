import { WIDTH, HEIGHT } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function poly(ctx, pts, fill, stroke = null, line = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function ring(ctx, x, y, r, fill, stroke = null, line = 1) {
  ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,TAU);
  if (fill) {ctx.fillStyle=fill;ctx.fill();}
  if (stroke) {ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
}

function ellipse(ctx,x,y,rx,ry,color) {
  ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=color;ctx.fill();
}

function line(ctx,x1,y1,x2,y2,color,width=1) {
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}

function aura(ctx,x,y,r,hex,opacity=.16) {
  const g = ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,hex);g.addColorStop(1,'transparent');
  ctx.globalAlpha=opacity;ring(ctx,x,y,r,g);ctx.globalAlpha=1;
}

function background(ctx, t, arena) {
  let g=ctx.createLinearGradient(0,0,0,HEIGHT);
  g.addColorStop(0,'#090f2a');g.addColorStop(.38,'#19263d');g.addColorStop(.65,'#092c3a');g.addColorStop(1,'#061622');
  ctx.fillStyle=g;ctx.fillRect(0,0,WIDTH,HEIGHT);
  // Eclipse: the bright edge paints the silhouette of the scene.
  aura(ctx,370,390,310,'#17d4bc',.35);
  aura(ctx,360,255,325,'#aa4def',.14);
  g=ctx.createRadialGradient(350,380,22,350,380,163);
  g.addColorStop(0,'#c9fff1');g.addColorStop(.73,'#72a9b1');g.addColorStop(.9,'#314b63');g.addColorStop(1,'#10243c');
  ring(ctx,350,380,153,g);
  ring(ctx,350,380,151,null,'#73f7db5c',2);
  for(let i=0;i<70;i++){
    const x=(i*127.3+77)%720,y=(i*53.71+43)%585;
    const twinkle=(Math.sin(t*1.2+i*2.7)+1)/2;
    ring(ctx,x,y,i%11===0?2:1,'rgba(156,245,249,'+(.08+twinkle*.32)+')');
  }
  // City silhouette with lit windows.
  for (let i=0;i<19;i++){
    const x=i*44-35, h=65+(i*41%110), top=510-h;
    ctx.fillStyle=i%2?'#122638':'#0d1e34';
    ctx.fillRect(x,top,40,h+60);
    ctx.fillStyle='#4adbc433';
    for(let j=0;j<3;j++)for(let k=0;k<5;k++)if((i+j*3+k*7)%4===0)ctx.fillRect(x+7+j*9,top+10+k*13,3,5);
  }
  // Monumental neon Torii in the distance.
  ctx.save();
  ctx.shadowColor='#5bfcdf';ctx.shadowBlur=14;
  line(ctx,140,437,140,595,'#315d68',23);
  line(ctx,580,437,580,595,'#315d68',23);
  poly(ctx,[[83,414],[635,414],[606,435],[113,435]],'#122e44','#64decf88',3);
  poly(ctx,[[109,394],[613,394],[595,408],[126,408]],'#245169','#77ebdd',2);
  line(ctx,151,464,570,464,'#47aeb8',12);
  ctx.restore();
  // Ground gets wider in perspective, yet stays inside the battle bounds.
  g=ctx.createLinearGradient(0,485,0,HEIGHT);
  g.addColorStop(0,'#0e3948');g.addColorStop(.50,'#13233a');g.addColorStop(1,'#0a1325');
  poly(ctx,[[0,505],[720,505],[720,1280],[0,1280]],g);
  for(let i=0;i<16;i++){
    const z=(i/16), y=520+z*z*785;
    line(ctx,0,y,720,y,i%4===0?'#40ddc03f':'#83cdf020',i%4===0?2:1);
  }
  for(let k=-16;k<=16;k++){
    line(ctx,360,500,360+k*62,1280,k%4===0?'#39b5b044':'#72b6d31b',1);
  }
  // Rings identify the combat zone, a pulsing central neon arena.
  ctx.save();
  ctx.translate(360,810);
  ctx.scale(1,.46);
  for(let r=190;r<=395;r+=72){
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);
    ctx.strokeStyle=r===334?'#55fbe080':'#38aec231';ctx.lineWidth=r===334?4:2;ctx.stroke();
  }
  ctx.rotate(t*.024);
  ctx.beginPath();
  for(let i=0;i<12;i++){
    const a=i*TAU/12;const x=Math.cos(a)*334,y=Math.sin(a)*334;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();ctx.strokeStyle='#76ffe845';ctx.lineWidth=4;ctx.stroke();
  ctx.restore();
  for(let i=0;i<15;i++){
    const x=(i*83+t*(i%2?7:-5))%850-60;
    const y=500+(i*97+t*(i%3===0?21:-13))%770;
    ctx.strokeStyle='#5feadb30';ctx.lineWidth=1;line(ctx,x,y,x+8,y-18,'#83eced4a');
  }
  // Footlights.
  aura(ctx,360,1100,410,'#2bdde0',.11);
  ctx.fillStyle='#03081961';ctx.fillRect(0,0,720,280);
  g=ctx.createLinearGradient(0,970,0,1280);g.addColorStop(0,'transparent');g.addColorStop(1,'#000b1ae0');
  ctx.fillStyle=g;ctx.fillRect(0,950,720,330);
  if(arena.phase==='dead'){ctx.fillStyle='#ac224520';ctx.fillRect(0,0,WIDTH,HEIGHT);}
}

function enemy(ctx,e,t){
  ctx.save();ctx.translate(e.x,e.y);
  const isBoss=e.type==='boss', isTank=e.type==='tank';
  const s=isBoss?1.75:isTank?1.18:1;
  const bounce=Math.sin(t*4+(e.id||0))*(isBoss?5:3);
  ellipse(ctx,0,e.r+12,s*25,9,'#000d20a8');
  ctx.translate(0,bounce);
  aura(ctx,0,0,isBoss?118:58,isBoss?'#ff703e':isTank?'#b179fd':e.type==='hunter'?'#f34b79':'#41f5db',isBoss?.34:.16);
  ctx.scale(s,s);
  const hue={slime:'#45d5cb',hunter:'#ff537b',tank:'#ad86e8',boss:'#ff8858'}[e.type];
  if(isBoss){
    poly(ctx,[[-24,-27],[-45,-73],[-8,-52]],'#642734','#ffbb7044',2);
    poly(ctx,[[24,-27],[45,-73],[8,-52]],'#642734','#ffbb7044',2);
  }
  // Strong silhouettes for the NPC's enemies.
  poly(ctx,[[-21,19],[-26,-3],[-16,-24],[0,-34],[17,-24],[25,0],[19,22],[0,28]],hue,'#04172b',3);
  poly(ctx,[[-12,23],[-18,38],[-8,40],[0,24]],'#203b4d');
  poly(ctx,[[12,23],[18,38],[8,40],[0,24]],'#203b4d');
  poly(ctx,[[-23,-7],[-36,12],[-27,17],[-9,5]],'#19364a');
  poly(ctx,[[23,-7],[36,12],[27,17],[9,5]],'#19364a');
  poly(ctx,[[-17,-16],[-8,-26],[0,-18],[10,-27],[18,-16],[18,-5],[-17,-5]],'#12314b');
  poly(ctx,[[-14,-14],[-3,-10],[-9,-4],[-17,-8]],'#ffefe2');
  poly(ctx,[[14,-14],[3,-10],[9,-4],[17,-8]],'#ffefe2');
  line(ctx,-9,-1,9,-1,'#172e45',2);
  if(isBoss){
    ring(ctx,0,5,10,'#ffdc99','#ffd389',1);
    ring(ctx,0,5,5,'#fff7c9');
  }
  ctx.restore();
  const ratio=clamp(e.hp/e.maxHp,0,1);
  if(ratio<.999 || isBoss){
    const w=isBoss?130:46;
    ctx.fillStyle='#02111dbb';ctx.fillRect(e.x-w/2,e.y-(isBoss?118:52),w,7);
    ctx.fillStyle=isBoss?'#ff9459':'#eb80be';ctx.fillRect(e.x-w/2,e.y-(isBoss?118:52),w*ratio,7);
  }
}

function ally(ctx,a,t){
  const y=a.y+Math.sin(t*7+a.phase)*6;
  aura(ctx,a.x,y,60,'#efbd7b',.2);
  ellipse(ctx,a.x,y+23,18,6,'#02101a98');
  ctx.save();ctx.translate(a.x,y);
  poly(ctx,[[-13,15],[-15,-7],[0,-24],[16,-7],[14,15],[0,26]],'#f3c884','#fff1cd',2);
  poly(ctx,[[-9,-10],[0,-19],[9,-10],[8,3],[-8,3]],'#384b6a');
  ring(ctx,-4,-4,2,'#fff');ring(ctx,4,-4,2,'#fff');
  ctx.restore();
}

function hero(ctx,h,t){
  const x=h.x, y=h.y;
  const facing=h.facing||1;
  const swing=Math.sin(t*19);
  const step=Math.sin(t*12)*4;
  ellipse(ctx,x,y+39,33,10,'#00091399');
  aura(ctx,x,y-12,118,h.shield>2?'#a494ff':'#4de9d3',h.shield>2?.26:.20);
  if(h.shield>0){
    ctx.beginPath();ctx.ellipse(x,y-10,43+Math.sin(t*4)*2,63,0,0,TAU);
    ctx.strokeStyle='#bdb4ff9f';ctx.lineWidth=4;ctx.stroke();
    ctx.beginPath();ctx.ellipse(x,y-10,49,69,0,0,TAU);
    ctx.strokeStyle='#7fe7ff3a';ctx.lineWidth=1;ctx.stroke();
  }
  ctx.save();
  ctx.translate(x,y+step);
  ctx.scale(facing,1);
  // Flowing battle cloak.
  poly(ctx,[[-18,-8],[-47,36+step],[-32,46],[0,12],[17,40],[35,30],[19,-15]],'#183f54','#376b84',2);
  poly(ctx,[[-18,13],[-40,39],[-21,33],[-4,19]],'#32acc089');
  // Legs and boots
  poly(ctx,[[-18,17],[-21,37],[-11,42],[-1,20]],'#193a4d','#66d8ce',2);
  poly(ctx,[[3,20],[12,41],[22,38],[18,15]],'#183a51','#66d8ce',2);
  // Armored upper body
  poly(ctx,[[-20,-17],[-21,14],[-9,25],[15,20],[23,-16],[0,-27]],'#134960','#7deee7',3);
  poly(ctx,[[-13,-15],[0,-20],[13,-15],[9,4],[-9,4]],'#265879');
  poly(ctx,[[-6,-8],[0,-14],[7,-8],[0,-2]],'#a7fff3');
  poly(ctx,[[-22,-17],[-35,-1],[-25,9],[-10,-10]],'#285b70','#b0ffec',2);
  poly(ctx,[[20,-17],[35,-1],[26,12],[11,-10]],'#22566b','#9affef',2);
  // Neck, face and expressive visor
  poly(ctx,[[-15,-48],[-16,-28],[-9,-17],[9,-17],[17,-28],[15,-46],[0,-55]],'#f0b48d','#493348',2);
  poly(ctx,[[-16,-39],[-11,-47],[-4,-41],[6,-48],[17,-39],[12,-31],[-11,-31]],'#101a35');
  poly(ctx,[[-11,-35],[-4,-33],[-9,-30],[-14,-32]],'#79fff0');
  poly(ctx,[[11,-35],[4,-33],[9,-30],[14,-32]],'#79fff0');
  // Kaito's asymmetric anime hair spikes
  poly(ctx,[[-18,-38],[-25,-56],[-10,-51],[-8,-70],[4,-56],[13,-72],[20,-48],[21,-35],[11,-45],[0,-38],[-9,-44]],'#15283d','#7ad8e6',2);
  poly(ctx,[[-8,-62],[2,-52],[0,-43],[-6,-50]],'#53d1d2');
  poly(ctx,[[12,-61],[16,-45],[8,-39],[8,-52]],'#42a6c1');
  // Sword slashes, glowing weapon always visible.
  ctx.save();
  ctx.translate(25,-1);
  ctx.rotate(-.45+swing*.23);
  ctx.shadowColor='#62fff1';ctx.shadowBlur=24;
  poly(ctx,[[-5,-4],[7,-4],[3,-88],[0,-105],[-5,-87]],'#aefcf2','#d5fff9',2);
  poly(ctx,[[0,-95],[4,-83],[1,-9]],'#54ced7');
  line(ctx,-14,-3,14,-3,'#eacfa6',7);
  line(ctx,0,-4,0,23,'#2a314d',8);
  ring(ctx,0,23,5,'#fcd38d');
  ctx.restore();
  ctx.restore();
  if(h.hitClock>.25){ring(ctx,x,y-19,60,'#ff6c8440','#ff9bab',3);}
  if(h.dashClock>3.45){
    ctx.save();ctx.globalAlpha=.28;ctx.translate(-facing*38,4);heroShadow(ctx,x,y,facing);ctx.restore();
  }
}

function heroShadow(ctx,x,y,facing) {
  ctx.save();ctx.translate(x,y);ctx.scale(facing,1);
  poly(ctx,[[-18,25],[-20,-28],[-12,-57],[6,-70],[25,-33],[22,26]],'#59f9e1');
  ctx.restore();
}

function bullet(ctx,b) {
  const color=b.color||'#a8ffe9';
  ctx.save();ctx.shadowColor=color;ctx.shadowBlur=16;
  line(ctx,b.x-b.vx*.038,b.y-b.vy*.038,b.x,b.y,color,b.r*.7);
  ring(ctx,b.x,b.y,b.r*.9,color);
  ring(ctx,b.x,b.y,b.r*.35,'#fff');
  ctx.restore();
}

function particles(ctx,arena) {
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const f of arena.effects) {
    const progress=1-f.ttl/f.max,r=f.radius*progress;
    ctx.beginPath();ctx.arc(f.x,f.y,r,0,TAU);
    ctx.strokeStyle=f.color;
    ctx.globalAlpha=(1-progress)*.75;
    ctx.lineWidth=clamp((1-progress)*18,2,18);
    ctx.stroke();
    ctx.globalAlpha=1;
  }
  for (const f of arena.flares) {
    const p=clamp(f.ttl/(f.kind==='god'?1.9:f.kind==='meteor'?1.3:3),0,1);
    if(f.kind==='meteor'){
      for(let i=0;i<7;i++){
        const x=(90+i*91),y=450+(i%4)*105 + (1-p)*230;
        aura(ctx,x,y,90,'#ff874a',.3*p);
        line(ctx,x-43,y-130,x,y,'#ffbd8b',10*p);
      }
    } else if(f.kind==='god'){
      for(let i=0;i<8;i++){
        const x=80+i*85;
        line(ctx,x,365,x+Math.sin(i*5)*18,1100,'#fff4ad',5*p);
      }
      aura(ctx,f.x,f.y,350,'#ffed9b',.35*p);
    } else if(f.kind==='freeze') {
      aura(ctx,f.x,f.y,285,'#7addff',.16*p);
      for(let i=0;i<12;i++){
        const a=i*TAU/12+f.ttl*.1,r=220;
        ring(ctx,f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,3,'#a4f5ff');
      }
    }
  }
  for(const p of arena.particles){
    const alpha=clamp(p.ttl/p.max,0,1);
    ctx.globalAlpha=alpha;
    ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);
  }
  ctx.globalAlpha=1;
  ctx.restore();
}

function floaters(ctx,items) {
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  for (const f of items) {
    ctx.globalAlpha=clamp(f.ttl,0,1);
    ctx.font='900 '+f.size+'px "Barlow Condensed",sans-serif';
    ctx.strokeStyle='#071525';ctx.lineWidth=5;ctx.strokeText(f.text,f.x,f.y);
    ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y);
  }
  ctx.restore();
}

export function draw(ctx,arena) {
  const { t }=arena;
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  ctx.save();
  const trauma=arena.shake*.5;
  if(trauma>.01)ctx.translate(Math.sin(t*61)*trauma,Math.cos(t*73)*trauma);
  background(ctx,t,arena);
  // Sort entities on feet position to preserve depth.
  const subjects=arena.enemies.map(e=>({y:e.y,kind:'enemy',data:e}));
  subjects.push(...arena.allies.map(a=>({y:a.y,kind:'ally',data:a})));
  subjects.push({y:arena.hero.y,kind:'hero',data:arena.hero});
  subjects.sort((a,b)=>a.y-b.y);
  for(const s of subjects){
    if(s.kind==='enemy')enemy(ctx,s.data,t);
    else if(s.kind==='ally')ally(ctx,s.data,t);
    else if(arena.phase==='combat')hero(ctx,s.data,t);
  }
  for(const b of arena.bullets)bullet(ctx,b);
  particles(ctx,arena);
  floaters(ctx,arena.floaters);
  // Atmospheric vignette on the battle zone edges.
  const vignette=ctx.createRadialGradient(360,720,290,360,720,830);
  vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#020617a0');
  ctx.fillStyle=vignette;ctx.fillRect(0,0,WIDTH,HEIGHT);
  if(arena.phase==='dead') {
    ctx.fillStyle='#1709178c';ctx.fillRect(0,470,720,540);
    ctx.font='900 96px "Barlow Condensed",sans-serif';ctx.textAlign='center';
    ctx.strokeStyle='#1c0c27';ctx.lineWidth=9;ctx.strokeText('DERROTADO',360,712);
    ctx.fillStyle='#ff7c9b';ctx.fillText('DERROTADO',360,712);
    ctx.font='700 26px "DM Sans",sans-serif';
    ctx.fillStyle='#f3ecf0';ctx.fillText('NOVO DESAFIO EM '+Math.ceil(arena.afterDeath)+'s',360,768);
  }
  ctx.restore();
}
