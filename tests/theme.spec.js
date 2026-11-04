import { test, expect } from '@playwright/test';

const state = page => page.evaluate(()=>{
  const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player,b=s.waves?.boss;
  if(!s.scene.isActive()||!p?.body)return {mode:'loading'};
  return {mode:s.mode,x:p.x,y:p.y,axisX:s.controls.axisX,axisY:s.controls.axisY,attack:s.controls.attackHeld,clock:s.clock,heroTexture:p.visual.texture.key,boss:b?{name:b.bossName,wave:b.bossWave,health:b.health,maxHealth:b.maxHealth,damage:b.damage,phase:b.bossPhase,skill:b.skill,castUntil:b.castUntil}:null};
});
async function start(page) {
  await page.getByTestId('start').click();await expect.poll(async()=>(await state(page)).mode).toBe('playing');
}

// Snapshot the Phaser texture or renderer directly: DOM panels cannot make these
// samples bright, so a renamed HUD alone cannot satisfy the scene-theme check.
async function worldPalette(page,objectName=null) {
  return page.evaluate(name=>new Promise(resolve=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    const source=name?s.children.getByName(name):s.game.renderer;
    if(!source?.snapshot)throw new Error(`World snapshot unavailable: ${name}`);
    source.snapshot(image=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=214;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let colored=0,milkMint=0,green=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>30){colored++;green+=pixels[i+1];if(pixels[i]>85&&pixels[i+1]>100&&pixels[i+2]>65&&pixels[i]+pixels[i+1]+pixels[i+2]>330)milkMint++;}
      resolve({width:image.width,height:image.height,coverage:milkMint/Math.max(1,colored),meanGreen:green/Math.max(1,colored)});
    });
  }),objectName);
}

async function spawnBoss(page,wave) {
  await page.evaluate(w=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.player.invulnerableUntil=s.clock+600000;
    s.waves.wave=w-1;s.waves.start(960,640);s.stats.wave=w;s.waves.boss.body.reset(1240,640);
  },wave);
}

async function clearFinalBoss(page) {
  await spawnBoss(page,50);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;
    const maxSwings=Math.ceil(b.health/Math.max(1,Math.round(s.player.stats.damage)))+1;
    for(let swing=0;swing<maxSwings&&b.active;swing++){b.body.reset(1040,640);s.combat.attack([b],s.clock);}
  });
  await expect.poll(async()=>['upgrade','reward'].includes((await state(page)).mode)).toBe(true);
  while((await state(page)).mode==='upgrade') {
    await page.locator('.upgrade-card').first().click();await page.waitForTimeout(30);
  }
  await expect.poll(async()=>(await state(page)).mode).toBe('reward');
}

test('Naiwa story leads into a real milk-and-mint plaza while preserving the supplied yellow hero',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page).toHaveTitle(/奶蛙.*快乐回收站/);
  const menu=page.locator('.menu-screen');await expect(menu).toContainText('奶蛙');await expect(menu).toContainText('快乐缓存');await expect(menu).toContainText('NAIWA');
  await page.screenshot({path:'artifacts/naiwa-menu-desktop.png'});
  await start(page);expect((await state(page)).heroTexture).toBe('mascot-hero');
  const plaza=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),floor=s.children.getByName('naiwa-cache-plaza'),sign=s.children.getByName('naiwa-plaza-sign');
    return {floor:floor?{type:floor.type,width:floor.width,height:floor.height,visible:floor.visible}:null,sign:sign?.text,props:s.children.list.filter(o=>/^naiwa-(pillar|shrine|crate|wall)-/.test(o.name)&&o.type==='Graphics'&&o.visible).length};
  });
  expect(plaza.floor).toMatchObject({width:1920,height:1280,visible:true});expect(plaza.sign.replaceAll(' ','')).toBe('蛙友广场');expect(plaza.props).toBeGreaterThanOrEqual(12);
  const paint=await worldPalette(page,'naiwa-cache-plaza');expect(paint.coverage).toBeGreaterThan(.55);expect(paint.meanGreen).toBeGreaterThan(110);
  await page.screenshot({path:'artifacts/naiwa-plaza-desktop.png'});expect(errors).toEqual([]);
});

test('the five channel guardians retain their real health, damage and opening combat patterns',async({page})=>{
  await page.goto('/');await start(page);
  const guardians=[{wave:10,name:'复读机厂长',hp:10000,damage:29,opening:'charge'},{wave:20,name:'阴阳弹幕王',hp:25000,damage:44,opening:'fan'},{wave:30,name:'缓存堵塞者',hp:60000,damage:59,opening:'charge'},{wave:40,name:'热搜风暴',hp:150000,damage:74,opening:'fan'},{wave:50,name:'红温总控',hp:500000,damage:90,opening:'charge'}];
  for(const guardian of guardians) {
    await spawnBoss(page,guardian.wave);
    await expect.poll(async()=>{const r=await state(page);return !!r.boss&&r.boss.castUntil>r.clock;}).toBe(true);
    const before=await state(page);expect(before.boss).toMatchObject({name:guardian.name,maxHealth:guardian.hp,damage:guardian.damage,phase:1,skill:guardian.opening});
    await expect(page.getByTestId('boss-health')).toContainText(guardian.name);
    // Hit through the regular player input, rather than assigning a health value.
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.body.reset(s.waves.boss.x-80,s.waves.boss.y);s.player.nextAttack=0;});
    await page.keyboard.down('KeyJ');await page.waitForTimeout(70);await page.keyboard.up('KeyJ');
    expect((await state(page)).boss.health).toBeLessThan(before.boss.health);
  }
  await page.screenshot({path:'artifacts/naiwa-channel-guardian.png'});
});

test('clearing the final guardian opens the themed happy shop and awards the frog-friend certification',async({page})=>{
  await page.goto('/');await start(page);await clearFinalBoss(page);
  const room=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    return {sign:s.children.getByName('naiwa-reward-sign')?.text,floor:s.children.getByName('naiwa-reward-shop')?.visible,parcel:s.children.getByName('naiwa-happy-parcel')?.visible,claimed:s.rewardRoom.claimed};
  });
  expect(room.sign.replaceAll(' ','')).toBe('快乐小卖部');expect(room.floor).toBe(true);expect(room.parcel).toBe(true);expect(room.claimed).toBe(false);
  const paint=await worldPalette(page);expect(paint.coverage).toBeGreaterThan(.3);expect(paint.meanGreen).toBeGreaterThan(100);
  await page.screenshot({path:'artifacts/naiwa-happy-shop.png'});
  await page.getByTestId('claim-reward').click();await expect(page.getByTestId('victory')).toBeVisible();await expect(page.getByTestId('run-medal')).toContainText('蛙友快乐认证');
  expect((await state(page)).mode).toBe('victory');await page.screenshot({path:'artifacts/naiwa-certification.png'});
  await page.getByTestId('menu').click();await expect(page.getByTestId('start')).toBeVisible();await expect(page).toHaveTitle(/奶蛙.*快乐回收站/);
});

for(const [width,height] of [[568,320],[844,390]]) {
  test(`Naiwa mobile ${width}×${height}: themed menus fit and floating movement can be combined with a real attack`,async({browser})=>{
    const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page).toHaveTitle(/奶蛙.*快乐回收站/);
    await expect(page.locator('.menu-route>li')).toHaveCount(5);
    expect(await page.locator('.menu-route b').allTextContents()).toEqual(['10','20','30','40','50']);
    // Compact menus intentionally hide the decorative chapter strip to leave
    // readable class cards and the start action; all five milestones stay in the DOM.
    if(width<=700)await expect(page.locator('.menu-route')).toBeHidden();
    else {
      await expect(page.locator('.menu-route')).toBeVisible();
      const routeBounds=await page.locator('.menu-route').boundingBox();
      for(const li of await page.locator('.menu-route>li').all()){const b=await li.boundingBox();expect(b.x).toBeGreaterThanOrEqual(routeBounds.x);expect(b.x+b.width).toBeLessThanOrEqual(routeBounds.x+routeBounds.width+.1);expect(b.y+b.height).toBeLessThanOrEqual(height);}
    }
    for(const id of ['class-warrior','class-mage','class-archer','start']){const b=await page.getByTestId(id).boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width);expect(b.y+b.height).toBeLessThanOrEqual(height);}
    await page.screenshot({path:`artifacts/naiwa-menu-${width}.png`});await start(page);
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=s.clock+600000;s.waves.alive.forEach(e=>e.stun(s.clock,600000));});
    const initial=await state(page),zone=await page.getByTestId('virtual-joystick').boundingBox(),attackBox=await page.getByTestId('touch-attack').boundingBox();
    const origin={id:1,x:zone.width*.5,y:height*.68},move={...origin,x:origin.x+24,y:origin.y-24},attack={id:2,x:attackBox.x+attackBox.width/2,y:attackBox.y+attackBox.height/2};
    const cdp=await context.newCDPSession(page),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
    await send('touchStart',[origin]);expect((await state(page)).axisX).toBe(0);await send('touchMove',[move]);await send('touchStart',[move,attack]);await page.waitForTimeout(150);
    const playing=await state(page);expect(playing.x).toBeGreaterThan(initial.x+15);expect(playing.attack).toBe(true);expect(playing.heroTexture).toBe('mascot-hero');await expect(page.getByTestId('joystick-base')).toBeVisible();
    const boxes=[];for(const action of ['attack','guard','dash','ultimate']){const b=await page.getByTestId(`touch-${action}`).boundingBox();expect(b.x).toBeGreaterThanOrEqual(width/3);expect(b.y).toBeGreaterThanOrEqual(90);expect(b.x+b.width).toBeLessThanOrEqual(width);expect(b.y+b.height).toBeLessThanOrEqual(height);boxes.push(b);}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true);}
    await page.screenshot({path:`artifacts/naiwa-playing-${width}.png`});await send('touchEnd',[]);await expect(page.getByTestId('joystick-base')).toBeHidden();expect((await state(page)).axisX).toBe(0);expect(errors).toEqual([]);await context.close();
  });
}
