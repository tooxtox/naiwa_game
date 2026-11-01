import { test, expect } from '@playwright/test';

const state = page => page.evaluate(()=>{
  const s=window.__LUMENFALL__.scene.getScene('Game');
  return {mode:s.mode,x:s.player.x,y:s.player.y,axisX:s.controls.axisX,axisY:s.controls.axisY,attack:s.controls.attackHeld,clock:s.clock,guardUntil:s.player.guardUntil};
});
async function start(page) {
  await page.goto('/');await page.getByTestId('start').tap();await expect.poll(async()=>(await state(page)).mode).toBe('playing');
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+600000;s.waves.alive.forEach(e=>e.stun(s.clock,600000));});
}
const point=(id,x,y)=>({id,x,y,radiusX:5,radiusY:5,force:1});

for(const [width,height] of [[568,320],[844,390]]) {
  test(`floating joystick ${width}×${height}: zero-origin starts, left-third ownership, captured dragging and independent action fingers`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await start(page);const cdp=await context.newCDPSession(page),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    const zone=page.getByTestId('virtual-joystick'),base=page.getByTestId('joystick-base'),bounds=await zone.boundingBox();
    expect(bounds.x).toBe(0);expect(bounds.y).toBe(0);expect(bounds.width).toBeCloseTo(width/3,0);expect(bounds.height).toBe(height);await expect(base).toBeHidden();
    // The same floating control can start in both the upper and lower parts of the zone.
    for(const [x,y] of [[bounds.width*.45,height*.32],[bounds.width*.7,height*.72]]) {
      const origin=point(1,x,y);await send('touchStart',[origin]);
      const still=await state(page);expect(still.axisX).toBe(0);expect(still.axisY).toBe(0);await expect(base).toBeVisible();
      const circle=await base.boundingBox();expect(circle.width).toBeLessThanOrEqual(112);expect(circle.height).toBeLessThanOrEqual(112);expect(circle.x+circle.width/2).toBeCloseTo(x,0);expect(circle.y+circle.height/2).toBeCloseTo(y,0);
      const moved=point(1,x+24,y-24);await send('touchMove',[moved]);await page.waitForTimeout(70);
      const moving=await state(page);expect(moving.axisX).toBeGreaterThan(.5);expect(moving.axisY).toBeLessThan(-.5);
      await send('touchEnd',[moved]);expect((await state(page)).axisX).toBe(0);expect((await state(page)).axisY).toBe(0);await expect(base).toBeHidden();
    }
    // Even a clipped visual at the viewport edge must start with exactly zero input.
    const edge=point(1,2,height-2);await send('touchStart',[edge]);expect((await state(page)).axisX).toBe(0);expect((await state(page)).axisY).toBe(0);await expect(base).toBeVisible();
    await send('touchMove',[point(1,22,height-22)]);expect((await state(page)).axisX).toBeGreaterThan(.4);await send('touchCancel',[]);await expect(base).toBeHidden();expect((await state(page)).axisX).toBe(0);
    // Touches in the other two thirds do not create a joystick or change the movement axes.
    const outside=point(1,width*.5,height*.5);await send('touchStart',[outside]);await send('touchMove',[point(1,outside.x+25,outside.y-25)]);
    expect((await state(page)).axisX).toBe(0);expect((await state(page)).axisY).toBe(0);await expect(base).toBeHidden();await send('touchEnd',[]);
    const origin=point(1,bounds.width*.5,height*.6),owner=point(1,origin.x+24,origin.y-24);
    await send('touchStart',[origin]);await send('touchMove',[owner]);const first=await state(page);
    const second=point(2,bounds.width*.8,height*.4);await send('touchStart',[owner,second]);await send('touchMove',[owner,point(2,second.x-40,second.y+35)]);
    const retained=await state(page);expect(retained.axisX).toBeCloseTo(first.axisX,4);expect(retained.axisY).toBeCloseTo(first.axisY,4);await send('touchEnd',[second]);
    // Capture follows the owner beyond its activation zone, while separate action fingers still work.
    const far=point(1,width*.7,height*.45);await send('touchMove',[far]);await expect.poll(async()=>(await state(page)).axisX).toBeGreaterThan(.9);
    const buttonPoint=async(name,id)=>{const b=await page.getByTestId(`touch-${name}`).boundingBox();return point(id,b.x+b.width/2,b.y+b.height/2);};
    const attack=await buttonPoint('attack',3),guard=await buttonPoint('guard',4);
    await send('touchStart',[far,attack]);await send('touchStart',[far,attack,guard]);await page.waitForTimeout(70);
    const three=await state(page);expect(three.attack).toBe(true);expect(three.axisX).toBeGreaterThan(.9);expect(three.guardUntil).toBeGreaterThan(three.clock);
    const capturedBase=await base.boundingBox();expect(capturedBase.x+capturedBase.width/2).toBeCloseTo(origin.x,0);
    await page.screenshot({path:`artifacts/floating-joystick-${width}.png`});
    await send('touchEnd',[far]);await expect(base).toBeHidden();expect((await state(page)).axisX).toBe(0);expect((await state(page)).attack).toBe(true);
    await send('touchEnd',[guard]);await send('touchEnd',[attack]);expect((await state(page)).attack).toBe(false);
    // Buttons alone never open the movement pad; pointer cancellation releases them too.
    await send('touchStart',[attack]);expect((await state(page)).attack).toBe(true);await expect(base).toBeHidden();await send('touchCancel',[]);expect((await state(page)).attack).toBe(false);
    await send('touchStart',[origin]);await send('touchMove',[owner]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await expect(base).toBeHidden();expect((await state(page)).axisX).toBe(0);expect((await state(page)).axisY).toBe(0);expect((await state(page)).mode).toBe('paused');
    await send('touchCancel',[]);expect(errors).toEqual([]);await context.close();
  });
}

test('floating joystick also moves through the safe reward room while combat buttons stay hidden',async({browser})=>{
  const context=await browser.newContext({viewport:{width:568,height:320},isMobile:true,hasTouch:true});const page=await context.newPage();await start(page);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.waves.wave=99;s.waves.start(960,640);s.stats.wave=100;
    const b=s.waves.boss;for(let swing=0;swing<2500&&b.active;swing++){b.body.reset(1040,640);s.combat.attack([b],s.clock);}
  });
  await expect.poll(async()=>(await state(page)).mode).toBe('reward');await expect(page.getByTestId('touch-attack')).toBeHidden();await expect(page.getByTestId('virtual-joystick')).toBeVisible();
  const initial=await state(page),zone=await page.getByTestId('virtual-joystick').boundingBox(),origin=point(1,zone.width*.5,220),north=point(1,origin.x,origin.y-32);
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});expect((await state(page)).axisY).toBe(0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[north]});await page.waitForTimeout(170);expect((await state(page)).y).toBeLessThan(initial.y-15);
  await expect(page.getByTestId('victory')).toBeVisible();await expect(page.getByTestId('joystick-base')).toBeHidden();expect((await state(page)).axisY).toBe(0);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await context.close();
});

test('desktop keeps both floating touch surfaces hidden',async({page})=>{
  await page.goto('/');await page.getByTestId('start').click();await expect.poll(async()=>(await state(page)).mode).toBe('playing');
  await expect(page.getByTestId('virtual-joystick')).toBeHidden();await expect(page.getByTestId('joystick-base')).toBeHidden();
});
