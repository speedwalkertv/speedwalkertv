import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(root, '..', '..', 'validation');
const server = spawn(process.execPath, ['src/server.js'], {
  cwd: root, env: { ...process.env, TIKTOK_USERNAME:'', PORT:'0', HOST:'127.0.0.1' },
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
}
