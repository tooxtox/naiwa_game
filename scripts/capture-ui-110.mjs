import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Presentation fixtures render the actual Phaser canvas and actual HUD. They do
// not claim to represent a played run, balance result, or historical score.
const phase = process.argv[2] ?? 'after';
const output = path.resolve(`artifacts/ui-110/${phase}`);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];
for (const [width, height] of [[568, 320], [667, 375], [844, 390], [932, 430], [1280, 720]]) {
  const mobile = width < 1000;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const capture = async state => {
    await page.screenshot({ path: `${output}/${width}x${height}-${state}.png` });
    results.push({ width, height, state, errors: [...errors] });
  };
  await page.goto('http://127.0.0.1:8080/');
  await page.getByTestId('start').waitFor();
  await page.getByTestId('class-mage').click();
  await capture('menu');
  await page.getByTestId('start').click();
  await page.waitForFunction(() => window.__LUMENFALL__?.scene.getScene('Game')?.player?.body);
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.player.invulnerableUntil = s.clock + 600000;
    s.waves.alive.forEach(e => e.stun(s.clock, 600000));
    s.player.ultimateCharge = 100;
    s.player.combo = 25;
  });
  await page.waitForTimeout(2900);
  await capture('battle');
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.combat.clear();
    s.waves.enemies.forEach(e => e.destroy());
    s.waves.enemies.length = 0;
    s.waves.wave = 9;
    s.waves.start(s.player.x, s.player.y);
    s.waves.alive.forEach(e => e.stun(s.clock, 600000));
    s.player.health = s.player.stats.maxHealth * .22;
  });
  await page.waitForTimeout(300);
  await capture('boss');
  if (phase !== 'before') {
    await page.evaluate(() => {
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();
      s.waves.enemies.forEach(e=>{if(e.active)e.destroy();});s.waves.enemies.length=0;
      s.waves.wave=49;s.waves.start(s.player.x,s.player.y);
      const b=s.waves.boss;b.body.reset(s.player.x+250,s.player.y+80);b.health=b.maxHealth*.2;
      b.tick(s.clock,s.player,()=>{},()=>{});
      b.stunUntil=0;b.skill='charge';b.lockedAngle=Math.PI;b.castStarted=s.clock;b.castUntil=s.clock+2000;
    });
    await page.waitForTimeout(200);await capture('final-boss');
  }
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.pauseRun();
    s.hud.setBuildInfo(['❄ 冰冻核心 2/3 · 三层寒霜冻结普通敌人，首领受抗性限制', '✦ 冰奶续冻 3/8 · 冻结时间提高，精炼仍有明确上限']);
    s.hud.showPause();
  });
  await capture('pause');
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.hud.showUpgrade([
      { id:'mage-freeze',name:'冰冻核心',description:'奶泡叠加寒霜，3 层短暂冻结。控场更稳；对 Boss 冻结有独立抗性。',icon:'❄',tag:'冰冻流',level:2,maxLevel:3,category:'core',rarity:'core',value:'寒霜控场' },
      { id:'mage-chain',name:'连锁爆破',description:'命中向附近目标连锁爆破。最多 3 次跳转，适合敌人聚集，单体收益较低。',icon:'✺',tag:'爆破流',level:1,maxLevel:3,category:'core',rarity:'core',value:'有限连锁' },
      { id:'power',name:'快乐加一',description:'攻击力 24 → 32 · 所有普通攻击获得强化',icon:'✦',tag:'攻击强化',level:2,maxLevel:5,category:'basic',rarity:'common',value:'+8 攻击' },
    ]);
  });
  await capture('core');
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.hud.showDeath({ ...s.stats, wave: 27, kills: 182, upgrades: 26, elapsed: 720, bestCombo: 48 });
  });
  await capture('death');
  await page.evaluate(() => {
    const s = window.__LUMENFALL__.scene.getScene('Game');
    s.waves.enemies.forEach(e => { if(e.active)e.destroy(); }); s.waves.enemies.length=0;
    s.stats = { ...s.stats, wave: 50, kills: 416, upgrades: 53, elapsed: 1320, bestCombo: 82 };
    s.mode = 'playing';
    s.enterRewardRoom();
    s.player.body.reset(960, 850);
    s.player.invulnerableUntil = Infinity;
  });
  await page.getByTestId('reward-room').waitFor();
  await page.waitForTimeout(200);
  await capture('reward-room');
  await page.evaluate(() => window.__LUMENFALL__.scene.getScene('Game').claimReward());
  await page.getByTestId('victory').waitFor();
  await capture('victory');
  await context.close();
}
await browser.close();
await writeFile(`${output}/manifest.json`, JSON.stringify(results, null, 2));
console.log(`Captured ${results.length} actual rendered states in ${output}`);
