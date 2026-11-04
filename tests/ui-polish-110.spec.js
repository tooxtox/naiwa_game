import { test, expect } from '@playwright/test';

const active = page => page.evaluate(() => Boolean(window.__LUMENFALL__?.scene.getScene('Game')?.player?.body));
const point = (id, x, y) => ({ id, x, y, radiusX:5, radiusY:5, force:1 });
// Pixel baselines isolate typography and interactive panel layout from seeded
// battlefield art. capture-ui-110.mjs separately captures the real canvas.
const goldenOptions = { animations:'disabled', maxDiffPixelRatio:.002, style:'#game-shell canvas { visibility:hidden !important; } #game-shell { background:#c7d6be !important; }' };
async function start(page) {
  await page.goto('/'); await page.getByTestId('start').click(); await expect.poll(() => active(page)).toBe(true);
  await page.evaluate(() => { const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=Infinity;s.waves.alive.forEach(e=>e.stun(s.clock,600000)); });
}
async function inside(page, locator, width, height) {
  await expect(locator).toBeVisible();
  const b=await locator.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x+b.width).toBeLessThanOrEqual(width+.5);expect(b.y+b.height).toBeLessThanOrEqual(height+.5);
  expect(await locator.evaluate(e=>{const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return e.contains(top);})).toBe(true);
}

for (const [width,height] of [[568,320],[667,375],[844,390],[932,430],[1280,720]]) {
  test(`1.1 UI ${width}x${height}: visual baselines, readable cards and reachable dialog actions`,async({browser})=>{
    const mobile=width<1000,context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
    for(const name of ['class-warrior','class-mage','class-archer','mode-campaign','mode-quick','start'])await inside(page,page.getByTestId(name),width,height);
    expect(await page.locator('.class-role').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(mobile?9:8);
    await page.getByTestId('start').click();await expect.poll(()=>active(page)).toBe(true);
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=Infinity;s.waves.alive.forEach(e=>e.stun(s.clock,600000));s.hud.setBuildInfo(['⬡ 奶盖反击 2/3 · 精准格挡释放冲击波，连续成功也不能无限削韧','✦ 反击加奶 3/8 · 强化有上限；观察首领前摇再出手']);s.pauseRun();});
    await expect(page.getByTestId('fullscreen')).toBeHidden();
    for(const name of ['resume','restart','menu'])await inside(page,page.getByTestId(name),width,height);
    await expect(page.locator('.pause-dialog')).toHaveScreenshot(`pause-${width}x${height}.png`,goldenOptions);
    await page.getByTestId('resume').click();await expect(page.getByTestId('fullscreen')).toBeVisible();
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.pauseRun();s.hud.showUpgrade([
      {id:'counter',name:'奶盖反击',description:'精准格挡触发冲击波，适合观察前摇后接近反击。普通格挡安全减伤，收益明显较低。',icon:'⬡',tag:'反击流',level:2,maxLevel:3,category:'core',rarity:'core',value:'精准反击'},
      {id:'spin',name:'快乐旋风',description:'连续命中扩大横扫；积累命中触发有限环斩。近身对群强，远离目标时要重新积累。',icon:'◎',tag:'旋风流',level:1,maxLevel:3,category:'core',rarity:'core',value:'连续命中'},
      {id:'power',name:'快乐加一',description:'攻击力 30 → 38 · 所有普通攻击获得强化',icon:'✦',tag:'攻击强化',level:2,maxLevel:5,category:'basic',rarity:'common',value:'+8 攻击'},
    ]);});
    await expect(page.locator('.upgrade-dialog')).toHaveScreenshot(`core-${width}x${height}.png`,goldenOptions);
    for(const card of await page.locator('.upgrade-card').all())await inside(page,card,width,height);
    const size=await page.locator('.upgrade-description').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(size).toBeGreaterThanOrEqual(mobile?11:10);
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.hud.showDeath({...s.stats,wave:27,kills:182,elapsed:720,upgrades:26,bestCombo:48,summary:{combatSeconds:590,damageDealt:46000,damageTaken:180,damagePrevented:310,perfectGuards:12,blocks:4,ultimates:9,bossBreaks:3,bossesDefeated:2,score:76,grade:'A',criteria:['完成波次、有效防御、首领表现分别计分。','连击与攻击次数不直接增加评分。'],build:['⬡ 奶盖反击 2/3 · 强化冲击波','✦ 反击加奶 3/8 · 有界成长']}});});
    for(const name of ['restart','menu'])await inside(page,page.getByTestId(name),width,height);
    await page.getByTestId('result-details').locator('summary').click();
    await expect(page.getByTestId('result-details')).toContainText('连击与攻击次数不直接增加评分');
    for(const name of ['restart','menu'])await inside(page,page.getByTestId(name),width,height);
    await page.screenshot({path:`artifacts/ui-110/regression-${width}x${height}-result.png`});expect(errors).toEqual([]);await context.close();
  });
}

test('1.1 touch: capture rejection, rotation and fullscreen revoke held input in both layouts',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),page=await context.newPage();await start(page);
  await page.evaluate(()=>document.fullscreenElement?document.exitFullscreen():undefined);
  const cdp=await context.newCDPSession(page),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const input=()=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return{x:s.controls.axisX,y:s.controls.axisY,attack:s.controls.attackHeld};});
  const landscapeReady=()=>page.getByTestId('touch-controls').evaluate(e=>{const r=e.getBoundingClientRect();return{width:Math.round(r.width),height:Math.round(r.height)};});
  await expect.poll(landscapeReady).toEqual({width:844,height:390});
  for(const layout of ['arc','compact']) {
    await page.evaluate(async layout=>{const {setPreference}=await import('/src/game/systems/Preferences.ts');setPreference('touchLayout',layout);},layout);
    // Rejecting capture used to throw before the pressed state/callback was set.
    await page.evaluate(()=>{window.restoreCapture=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=function(){throw new DOMException('Capture unavailable','InvalidStateError');};});
    const b=await page.getByTestId('touch-attack').boundingBox(),attack=point(2,b.x+b.width/2,b.y+b.height/2),origin=point(1,90,220),moved=point(1,120,220);
    await send('touchStart',[origin]);await send('touchMove',[moved]);await send('touchStart',[moved,attack]);
    await expect.poll(input).toMatchObject({attack:true});expect((await input()).x).toBeGreaterThan(.7);
    await send('touchMove',[moved,point(2,500,180)]);await send('touchEnd',[]);expect(await input()).toEqual({x:0,y:0,attack:false});
    await page.evaluate(()=>{Element.prototype.setPointerCapture=window.restoreCapture;});
    await send('touchStart',[origin]);await send('touchMove',[moved]);await send('touchStart',[moved,attack]);
    await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));expect(await input()).toEqual({x:0,y:0,attack:false});await send('touchCancel',[]);
    await send('touchStart',[origin]);await send('touchMove',[moved]);await page.setViewportSize({width:390,height:844});
    await expect.poll(input).toEqual({x:0,y:0,attack:false});await send('touchCancel',[]);await page.setViewportSize({width:844,height:390});
    // Phaser's Scale RESIZE and the controls ResizeObserver run after the browser
    // viewport change; wait for the real landscape geometry before the next fingers.
    await expect.poll(landscapeReady).toEqual({width:844,height:390});
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');if(s.mode==='paused')s.resumeRun();});
  }
  await context.close();
});

test('1.1 HUD: bounded combo expression, countdown display and reduced-motion controls',async({page})=>{
  await start(page);await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.pauseRun();s.hud.showGame();const state={...s.hud.state,combo:9};s.hud.update(state);s.hud.update({...state,combo:10});});
  await expect(page.locator('.combo-feedback')).toContainText('10 连击');await expect(page.locator('.combo-notice')).toHaveAttribute('data-tier','warm');
  await page.evaluate(()=>{const h=window.__LUMENFALL__.scene.getScene('Game').hud;h.update({...h.state,combo:50});h.update({...h.state,combo:0});h.setIntermission({nextWave:10,remaining:2100,duration:2200,boss:true,chapter:'蛙友广场'});});
  await expect(page.locator('.combo-feedback')).toContainText('50 连击收工');await expect(page.getByTestId('intermission')).toContainText('首领即将登场');
  await expect(page.locator('[data-field="intermissionSeconds"]')).toHaveText('3');
  await page.evaluate(async()=>{const {setPreference}=await import('/src/game/systems/Preferences.ts');setPreference('reducedMotion',true);});
  await expect(page.locator('.lumen-ui')).toHaveClass(/reduced-motion/);
  await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').hud.setIntermission(null));await expect(page.getByTestId('intermission')).toBeHidden();
});
