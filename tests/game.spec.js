import { test, expect } from '@playwright/test';

const state = page => page.evaluate(() => {
  const s = window.__LUMENFALL__.scene.getScene('Game');
  if (!s.scene.isActive() || !s.player?.body) return { mode: 'loading' };
  const p = s.player;
  return { mode:s.mode, clock:s.clock, x:p.x, y:p.y, vx:p.body.velocity.x, vy:p.body.velocity.y, aim:p.aimAngle, health:p.health, seed:s.stats.seed, kills:s.stats.kills, wave:s.waves.wave, stats:{...p.stats}, axisX:s.controls.axisX, axisY:s.controls.axisY, attack:s.controls.attackHeld, nextDash:p.nextDash, dashUntil:p.dashUntil, guardUntil:p.guardUntil, nextGuard:p.nextGuard, charge:p.ultimateCharge, remaining:s.waves.alive.length, kinds:s.waves.alive.map(e=>e.kind), visualY:p.visual.y, visualDepth:p.visual.depth, classId:p.classId };
});
async function start(page) {
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect.poll(async () => (await state(page)).mode).toBe('playing');
  await page.waitForTimeout(180);
}

test('overhead: normalized two-axis movement, guard, dash and complete roguelite cycle', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  await expect(page.getByTestId('touch-controls')).toBeHidden();
  const initial = await state(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(180); await page.keyboard.up('KeyD');
  expect((await state(page)).x).toBeGreaterThan(initial.x + 30);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(180); await page.keyboard.up('KeyW');
  expect((await state(page)).y).toBeLessThan(initial.y - 20);
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyS'); await page.waitForTimeout(60);
  let current = await state(page);
  expect(Math.hypot(current.axisX, current.axisY)).toBeCloseTo(1, 2);
  expect(Math.hypot(current.vx, current.vy / .72)).toBeCloseTo(current.stats.speed, 0);
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS'); await page.waitForTimeout(50);
  current = await state(page); expect(current.vx).toBe(0); expect(current.vy).toBe(0);
  const floorY = current.y;
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).guardUntil).toBeGreaterThan(current.clock);
  current = await state(page); expect(current.y).toBeCloseTo(floorY, 0); expect(Math.abs(current.visualY-current.y)).toBeLessThan(3);
  expect(await page.evaluate(() => 'jumps' in window.__LUMENFALL__.scene.getScene('Game').player)).toBe(false);
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyS'); await page.waitForTimeout(40);
  await page.keyboard.press('KeyK'); await page.waitForTimeout(50);
  const dash = await state(page); expect(dash.dashUntil).toBeGreaterThan(dash.clock); expect(dash.vx).toBeGreaterThan(450); expect(dash.vy).toBeGreaterThan(300);
  await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
  await page.evaluate(() => { const s=window.__LUMENFALL__.scene.getScene('Game'); s.combat.hurt(10,s.player.x+5,s.clock,s.player.y+5); });
  expect((await state(page)).health).toBe(dash.health);
  await page.keyboard.press('Escape'); await expect(page.getByTestId('resume')).toBeVisible();
  const paused = await state(page); await page.waitForTimeout(200); expect((await state(page)).clock).toBe(paused.clock);
  await page.keyboard.press('Escape'); await expect.poll(async () => (await state(page)).mode).toBe('playing');
  await page.waitForTimeout(300);
  // Keep real enemies stationary in the guaranteed clear central aisle; attacks still use real damage and kill callbacks.
  await page.evaluate(() => {
    const s=window.__LUMENFALL__.scene.getScene('Game'); s.player.body.reset(960,640);
    s.waves.alive.forEach((e,i)=>{e.body.reset(1040+i*3,640);e.stun(s.clock,20000);});
  });
  await page.keyboard.down('KeyJ');
  await expect.poll(async () => (await state(page)).mode, { timeout:6000 }).toBe('upgrade');
  await page.keyboard.up('KeyJ');
  expect((await state(page)).kills).toBe(4); await expect(page.locator('.upgrade-card')).toHaveCount(3);
  await page.screenshot({path:'artifacts/classes-upgrade.png'});
  const upgradePause = await state(page); await page.waitForTimeout(200); expect((await state(page)).clock).toBe(upgradePause.clock);
  const before = upgradePause.stats;
  await page.locator('.upgrade-card').first().click(); expect((await state(page)).stats).not.toEqual(before);
  await expect.poll(async () => (await state(page)).wave, { timeout:5000 }).toBe(2); expect((await state(page)).kinds).toContain('elite');
  await page.evaluate(() => { const s=window.__LUMENFALL__.scene.getScene('Game'); s.combat.hurt(999,s.player.x+15,s.clock); });
  await expect(page.locator('.death-dialog')).toBeVisible(); expect((await state(page)).health).toBe(0);
  await page.screenshot({path:'artifacts/classes-death.png'});
  await page.getByTestId('restart').click(); await expect.poll(async () => (await state(page)).mode).toBe('playing');
  const restarted=await state(page); expect(restarted.seed).not.toBe(initial.seed); expect(restarted.kills).toBe(0); expect(restarted.wave).toBe(1); expect(restarted.health).toBe(initial.stats.maxHealth); expect(restarted.charge).toBe(0);
  await page.getByTestId('pause').click(); await page.getByTestId('menu').click(); await expect(page.getByTestId('start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: fullscreen, independent three-finger movement/attack/guard, dash, finisher, rotate and resume', async ({ browser }) => {
  const context = await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await start(page); await expect(page.getByTestId('touch-controls')).toBeVisible(); await expect(page.getByTestId('touch-jump')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('game-shell');
  const bounds=await page.locator('canvas').boundingBox(); expect(bounds).toMatchObject({x:0,y:0,width:844,height:390});
  const cdp=await context.newCDPSession(page);
  const center=async(testid,id,dx=0,dy=0)=>{const b=await page.getByTestId(testid).boundingBox();return {id,x:b.x+b.width/2+dx,y:b.y+b.height/2+dy,radiusX:5,radiusY:5,force:1};};
  const joy=await center('virtual-joystick',1,24,-24),attack=await center('touch-attack',2),guard=await center('touch-guard',3),dash=await center('touch-dash',4),ultimate=await center('touch-ultimate',5);
  const dispatch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const initial=await state(page);
  await dispatch('touchStart',[joy]); await dispatch('touchStart',[joy,attack]); await page.waitForTimeout(200);
  let current=await state(page); expect(current.axisX).toBeGreaterThan(.5); expect(current.axisY).toBeLessThan(-.5); expect(current.attack).toBe(true); expect(current.x).toBeGreaterThan(initial.x+20); expect(current.y).toBeLessThan(initial.y-15);
  await dispatch('touchStart',[joy,attack,guard]); await page.waitForTimeout(80);
  current=await state(page); expect(current.guardUntil).toBeGreaterThan(current.clock); expect(current.attack).toBe(true); expect(current.axisX).toBeGreaterThan(.5);
  await expect(page.getByTestId('touch-guard')).toHaveAttribute('data-active','true');
  await dispatch('touchEnd',[guard]); await dispatch('touchStart',[joy,attack,dash]); await page.waitForTimeout(50);
  current=await state(page); expect(current.dashUntil).toBeGreaterThan(current.clock); expect(current.vx).toBeGreaterThan(450); expect(current.vy).toBeLessThan(-300);
  await dispatch('touchEnd',[dash]); await dispatch('touchEnd',[attack]);
  expect((await state(page)).attack).toBe(false); expect((await state(page)).axisX).toBeGreaterThan(.5);
  await dispatch('touchEnd',[joy]); expect((await state(page)).axisX).toBe(0); expect((await state(page)).axisY).toBe(0);
  await page.waitForTimeout(230); expect((await state(page)).vx).toBe(0); expect((await state(page)).vy).toBe(0);
  await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').player.addUltimateCharge(100));
  await expect(page.getByTestId('touch-ultimate')).toHaveAttribute('data-charge','100');
  await dispatch('touchStart',[ultimate]); await dispatch('touchEnd',[ultimate]);
  await expect.poll(async()=>(await state(page)).charge).toBe(0);
  await page.screenshot({path:'artifacts/classes-mobile-fullscreen.png'});
  await page.getByTestId('fullscreen').tap(); await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
  await page.getByTestId('fullscreen').tap(); await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('game-shell');
  expect(await page.evaluate(()=>document.fullscreenElement.contains(document.getElementById('rotate-hint')))).toBe(true);
  await page.getByTestId('fullscreen').tap(); await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);
  await page.setViewportSize({width:390,height:844}); await expect(page.locator('#rotate-hint')).toBeVisible();
  await expect.poll(async()=>(await state(page)).mode).toBe('paused');
  await page.setViewportSize({width:844,height:390}); await expect(page.locator('#rotate-hint')).toBeHidden();
  await page.getByTestId('resume').tap(); await expect.poll(async()=>(await state(page)).mode).toBe('playing');
  expect(await page.evaluate(()=>({x:window.scrollX,y:window.scrollY}))).toEqual({x:0,y:0}); expect(errors).toEqual([]); await context.close();
});

test('iPhone fallback: full viewport with home-screen guidance when Fullscreen API is unavailable', async ({ browser }) => {
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();
  await page.addInitScript(()=>{
    for(const prototype of [Element.prototype,HTMLElement.prototype])for(const key of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(prototype,key,{value:undefined,configurable:true});
    Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true}); Object.defineProperty(document,'webkitFullscreenEnabled',{value:false,configurable:true});
  });
  await start(page); await expect(page.getByTestId('fullscreen-hint')).toContainText('添加到主屏幕');
  expect(await page.locator('#game-shell').getAttribute('data-fullscreensupported')).toBe('false');
  const bounds=await page.locator('canvas').boundingBox(); expect(bounds.width).toBe(844); expect(bounds.height).toBe(390); await context.close();
});

test('arena edge: navigation padding does not create an invulnerable strip', async ({ page }) => {
  await start(page); const initial=await state(page);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game'); s.player.body.reset(960,1180); s.waves.alive.find(e=>e.kind==='melee').body.reset(960,1080);});
  await expect.poll(async()=>(await state(page)).health,{timeout:4000}).toBeLessThan(initial.health);
});
