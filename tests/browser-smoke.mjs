import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(root, '..', '..', 'validation');
const token='private-test-token-at-least-24';
const isolatedBrain=await mkdtemp(path.join(os.tmpdir(),'jev-browser-smoke-'));
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: root, env: { ...process.env, TIKTOK_USERNAME:'', TYPESAFE_API_KEY:'',
    JEV_CONTROL_TOKEN:token, JEV_BRAIN_PATH:isolatedBrain, PORT:'0', HOST:'127.0.0.1' },
  stdio:['ignore','pipe','pipe']
});
let browser;
let logs='';
try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Servidor nao iniciou: '+logs)),15000);
    server.stdout.on('data', buf => {
      logs += String(buf);
      const match=logs.match(/127\.0\.0\.1:(\d+)/);
      if(match){clearTimeout(timeout);resolve(Number(match[1]));}
    });
    server.stderr.on('data', buf => { logs += String(buf); });
    server.on('exit', code => {clearTimeout(timeout);reject(new Error('Processo saiu '+code));});
  });
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = await chromium.launch({ headless: true, executablePath: chrome, args:['--disable-gpu-sandbox'] });
  const page = await browser.newPage({viewport:{width:1650,height:1050},deviceScaleFactor:1});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  await page.goto('http://127.0.0.1:'+port+'/npc/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.NPC_CHAOS?.getStatus().mode === 'demo',{timeout:15000});
  await page.waitForFunction(() => {
    const portrait = document.querySelector('.hero-avatar img');
    return portrait?.complete && portrait.naturalWidth > 0;
  }, undefined, {timeout:15000});
  const scenery = await page.request.get('http://127.0.0.1:'+port+'/npc/assets/eclipse-arena.webp');
  assert.equal(scenery.status(),200);
  assert.match(scenery.headers()['content-type'],/image\/webp/);
  await page.waitForTimeout(2500);
  assert.equal(await page.title(),'NPC CHAOS LIVE — O Herói do Chat');
  assert.equal(await page.locator('#hero-level').innerText(),'LVL 1');
  const moved = await page.evaluate(() => {
    const a = window.NPC_CHAOS.game;
    return a.t > 1 && a.hero.x !== 360 && a.enemies.length > 0;
  });
  assert.equal(moved,true,'Hero must move without player input');
  await page.locator('[data-test=gift][data-gift=galaxy]').click();
  await page.waitForFunction(() => window.NPC_CHAOS.game.callout.title === 'PODER DIVINO');
  assert.equal(await page.locator('#callout-title').innerText(),'PODER DIVINO');
  await page.locator('[data-test=follow]').click();
  await page.waitForFunction(() => window.NPC_CHAOS.game.allies.length >= 1);
  assert.ok((await page.locator('#activity-list .activity').count()) > 0);
  const jevPage=await browser.newPage({viewport:{width:1650,height:1050}});
  jevPage.on('pageerror',e=>pageErrors.push('jev: '+String(e)));
  let decisions=0;
  await jevPage.route('**/api/jev/status',route=>route.fulfill({json:{ready:true,memoryReady:true,configuration:'ok',provider:'TypeSafe',model:'jev-latest',intervalMs:2000}}));
  await jevPage.route('**/api/jev/decision',route=>{
    decisions++;
    const request=route.request();
    assert.equal(request.headers().authorization,'Bearer private-test-token-at-least-24');
    route.fulfill({json:{source:'typesafe-api',movement:'retreat',fire:true,dash:false,targetId:null,confidence:.9,latencyMs:175,model:'jev-latest'}});
  });
  await jevPage.goto('http://127.0.0.1:'+port+'/npc/');
  await jevPage.locator('#jev-connect').waitFor({state:'visible'});
  await jevPage.waitForFunction(()=>!document.querySelector('#jev-connect').disabled);
  await jevPage.locator('#jev-token').fill('private-test-token-at-least-24');
  await jevPage.locator('#jev-connect').click();
  await jevPage.waitForFunction(()=>window.NPC_CHAOS?.game.agentDecision?.movement==='retreat');
  assert.equal(await jevPage.locator('#jev-mode').innerText(),'API ATIVA');
  assert.ok(decisions>0,'Jev should issue decisions');
  await jevPage.close();
  const memoryPage=await browser.newPage({viewport:{width:1480,height:1000}});
  memoryPage.on('pageerror',error=>pageErrors.push('memory: '+String(error)));
  await memoryPage.goto('http://127.0.0.1:'+port+'/npc/memory/');
  assert.equal(await memoryPage.title(),'Cérebro da Jev · NPC CHAOS');
  await memoryPage.locator('#access-token').fill(token);
  await memoryPage.locator('#connect').click();
  await memoryPage.waitForFunction(()=>document.querySelector('#connection')?.textContent==='Memória conectada');
  assert.equal(await memoryPage.locator('#metric-matches').innerText(),'0');
  await memoryPage.locator('#notes').fill('Esquivar antes de atacar.');
  await memoryPage.locator('#save-notes').click();
  await memoryPage.waitForFunction(()=>document.querySelector('#notice')?.textContent.includes('salvas'));
  const match={id:'smoke-match-0001',duration:2,wave:1,kills:0,score:5,damageTaken:2,hitsTaken:1,
    shots:2,shotsHit:1,projectileHits:1,frames:[
      {t:0,movement:'retreat',hpRatio:1,nearestDistance:50,closeEnemies:1,projectiles:0,hitsTaken:0,damageTaken:0,kills:0,wave:1},
      {t:1,movement:'retreat',hpRatio:.9,nearestDistance:80,closeEnemies:1,projectiles:1,hitsTaken:1,damageTaken:2,kills:0,wave:1}
    ]};
  const posted=await memoryPage.request.post('http://127.0.0.1:'+port+'/api/jev/memory/match',{
    headers:{Authorization:'Bearer '+token},data:match
  });
  assert.equal(posted.status(),200);
  await memoryPage.locator('#refresh').click();
  await memoryPage.waitForFunction(()=>document.querySelector('#metric-matches')?.textContent==='1');
  assert.match(await memoryPage.locator('#match-list').innerText(),/5 pontos/);
  await memoryPage.close();
  await mkdir(screenshotDir,{recursive:true});
  const deskPath=path.join(screenshotDir,'npc-chaos-desktop.png');
  await page.screenshot({path:deskPath,fullPage:true});
  const overlay = await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
  overlay.on('pageerror',e => pageErrors.push('overlay: '+String(e)));
  await overlay.goto('http://127.0.0.1:'+port+'/npc/?overlay=1');
  await overlay.waitForTimeout(1600);
  assert.equal(await overlay.locator('body').evaluate(el=>el.classList.contains('overlay')),true);
  assert.equal(await overlay.locator('.side').first().isVisible(),false);
  const overlayPath=path.join(screenshotDir,'npc-chaos-overlay.png');
  await overlay.screenshot({path:overlayPath,fullPage:true});
  assert.deepEqual(pageErrors,[]);
  console.log('BROWSER_SMOKE_PASS: NPC auto / gift / follow / overlay / no JS errors');
  console.log('DESKTOP_SCREENSHOT='+deskPath);
  console.log('OVERLAY_SCREENSHOT='+overlayPath);
} finally {
  await browser?.close();
  server.kill();
  await rm(isolatedBrain,{recursive:true,force:true,maxRetries:4,retryDelay:300});
}
