import { test, expect } from '@playwright/test';

async function start(page,classId) {
  await page.goto('/');await page.getByTestId(`class-${classId}`).click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return s.scene.isActive()&&s.combat&&s.player?.body?s.mode:'loading';})).toBe('playing');
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.player.body.reset(960,640);s.player.invulnerableUntil=0;
    s.waves.alive.forEach((e,i)=>{e.body.reset(1180+i*45,640);e.stun(s.clock,600000);e.health=e.maxHealth=10000;e.body.moves=false;});
    s.player.stats.critChance=0;
  });
}
const state=page=>page.evaluate(()=>{
  const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player,w=s.children.getByName('player-weapon');
  return {mode:s.mode,clock:s.clock,x:p.x,y:p.y,charge:p.ultimateCharge,kills:s.stats.kills,visualAlpha:p.visual.alpha,
    body:{width:p.body.width,height:p.body.height,offsetX:p.body.offset.x,offsetY:p.body.offset.y,bottom:p.body.bottom-p.y},
    weapon:{action:w.getData('action'),progress:w.getData('progress'),x:w.x,y:w.y,rotation:w.rotation,scaleX:w.scaleX,scaleY:w.scaleY,draw:w.getData('draw')},
    effects:s.children.list.filter(o=>o.visible&&o.name?.startsWith('vfx-')).map(o=>({name:o.name,kind:o.getData('vfxKind'),serial:o.getData('serial'),elapsed:o.getData('elapsed'),duration:o.getData('duration'),commands:o.commandBuffer?.length??0,x:o.x,y:o.y,alpha:o.alpha,texture:o.texture?.key}))};
});
const effect=(snapshot,kind)=>snapshot.effects.find(item=>item.kind===kind);
const pose=s=>[s.weapon.x,s.weapon.y,s.weapon.rotation,s.weapon.scaleX,s.weapon.scaleY].map(v=>v.toFixed(3)).join(',');

// Read pixels from Phaser's real renderer after a render frame, covering the hero
// and weapon. This catches geometry that changes metadata without visible output.
async function pixels(page) {
  return page.evaluate(()=>new Promise(resolve=>{
    const game=window.__LUMENFALL__,s=game.scene.getScene('Game'),c=s.cameras.main,p=s.player;
    const x=Math.max(0,Math.min(game.scale.width-320,(p.x-c.scrollX)*c.zoom-160));
    const y=Math.max(0,Math.min(game.scale.height-260,(p.y-c.scrollY)*c.zoom-210));
    game.renderer.snapshotArea(x,y,320,260,image=>{
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=78;
      const context=canvas.getContext('2d');context.drawImage(image,0,0,96,78);
      resolve(Array.from(context.getImageData(0,0,96,78).data));
    });
  }));
}
const changedPixels=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>36)count++;return count;};

for(const classId of ['warrior','mage','archer']) {
  test(`${classId}: real attacks animate several weapon poses and renderer pixels without moving the floor collider`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,classId);
    const initial=await state(page),idlePixels=await pixels(page),frames=[];
    // Collect every actual render frame independently of the slower image readback.
    await page.evaluate(()=>{
      const game=window.__LUMENFALL__,s=game.scene.getScene('Game');window.weaponSamples=[];
      window.collectWeapon=()=>{const p=s.player,w=s.children.getByName('player-weapon');window.weaponSamples.push({x:p.x,y:p.y,
        body:{width:p.body.width,height:p.body.height,offsetX:p.body.offset.x,offsetY:p.body.offset.y,bottom:p.body.bottom-p.y},
        weapon:{action:w.getData('action'),x:w.x,y:w.y,rotation:w.rotation,scaleX:w.scaleX,scaleY:w.scaleY,draw:w.getData('draw')},
        effects:s.children.list.filter(o=>o.visible&&o.getData?.('vfxKind')==='attack').map(o=>({kind:'attack',commands:o.commandBuffer.length}))});};
      game.events.on('postrender',window.collectWeapon);
    });
    await page.keyboard.down('KeyJ');
    for(let i=0;i<5;i++){frames.push(await pixels(page));await page.waitForTimeout(12);}
    await page.keyboard.up('KeyJ');
    const samples=await page.evaluate(()=>{window.__LUMENFALL__.events.off('postrender',window.collectWeapon);return window.weaponSamples;});
    const active=samples.filter(s=>s.weapon.action==='attack');expect(active.length).toBeGreaterThanOrEqual(3);
    expect(new Set(active.map(pose)).size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...frames.map(frame=>changedPixels(idlePixels,frame)))).toBeGreaterThan(30);
    for(const sample of samples) {
      expect(sample.x).toBe(initial.x);expect(sample.y).toBe(initial.y);
      expect(sample.body).toEqual({width:24,height:14,offsetX:12,offsetY:49,bottom:-1});
    }
    expect(samples.some(s=>effect(s,'attack')?.commands>20)).toBe(true);
    if(classId==='archer')expect(Math.max(...active.map(s=>s.weapon.draw))-Math.min(...active.map(s=>s.weapon.draw))).toBeGreaterThan(.2);
    await page.screenshot({path:`artifacts/combat-${classId}-attack.png`});
    await expect.poll(async()=>(await state(page)).weapon.action).toBe('idle');
    await expect.poll(async()=>!!effect(await state(page),'attack'),{timeout:1200}).toBe(false);expect(errors).toEqual([]);
  });

  test(`${classId}: dash, guard, counter and ultimate produce visible animated effects, freeze when paused and recycle`,async({page})=>{
    await start(page,classId);
    // Keep the render-lifecycle fixture alive through percentage ultimates.
    await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').waves.alive.forEach(e=>{e.health=e.maxHealth*10;}));
    for(const [key,kind] of [['KeyK','dash'],['Space','guard'],['KeyQ','ultimate']]) {
      if(kind==='ultimate')await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').player.addUltimateCharge(100));
      await page.keyboard.press(key);
      await expect.poll(async()=>effect(await state(page),kind)?.commands??0,{intervals:[10]}).toBeGreaterThan(20);
      const first=await state(page);expect(first.weapon.action).toBe(kind);if(kind==='ultimate')expect(first.visualAlpha).toBe(1);
      if(kind==='guard') {
        // Direct damage deliberately has no attacker: only actual nearby actors can counter.
        await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.hurt(10,s.player.x+40,s.clock,s.player.y);});
        await expect.poll(async()=>effect(await state(page),'counter')?.commands??0,{intervals:[10]}).toBeGreaterThan(20);
        await expect.poll(async()=>(await state(page)).weapon.action,{intervals:[10]}).toBe('counter');
      }
      await page.waitForTimeout(40);await page.keyboard.press('Escape');
      await expect(page.locator('.pause-dialog')).toBeVisible();
      const frozen=await state(page);await page.waitForTimeout(180);const paused=await state(page);
      expect(paused.clock).toBe(frozen.clock);expect(paused.weapon).toEqual(frozen.weapon);expect(paused.effects).toEqual(frozen.effects);
      await page.getByTestId('resume').click();
      await expect.poll(async()=>!!effect(await state(page),kind),{timeout:2000}).toBe(false);
      if(kind==='guard')await expect.poll(async()=>!!effect(await state(page),'counter'),{timeout:1500}).toBe(false);
      await page.screenshot({path:`artifacts/combat-${classId}-${kind}.png`});
    }
    const final=await state(page);expect(final.effects.filter(e=>['attack','dash','guard','counter','ultimate'].includes(e.kind))).toEqual([]);
  });
}

test('dash effect follows movement even while auto-aim fires at a target in another direction',async({page})=>{
  await start(page,'warrior');
  await page.keyboard.down('KeyW');await page.keyboard.down('KeyJ');await page.waitForTimeout(30);await page.keyboard.press('KeyK');
  await expect.poll(async()=>(await state(page)).weapon.action,{intervals:[10]}).toBe('dash');
  const direction=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),slot=s.effects.visuals.find(v=>v.duration>0&&v.kind==='dash');
    return {aim:s.player.aimAngle,velocityY:s.player.body.velocity.y,effectAngle:slot.angle};
  });
  expect(Math.cos(direction.aim)).toBeGreaterThan(.8);expect(direction.velocityY).toBeLessThan(0);expect(Math.sin(direction.effectAngle)).toBeLessThan(-.95);
  await page.keyboard.up('KeyJ');await page.keyboard.up('KeyW');
});

const ultimateDamage={warrior:{health:150000,fixed:480},mage:{health:175000,fixed:576},archer:{health:180000,fixed:720}};
for(const classId of ['warrior','mage','archer']) {
  test(`${classId}: a complete ultimate removes a substantial exact share of the 500000 HP final boss and scales with ultimate upgrades`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,classId);
    await page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=49;s.waves.start(960,640);s.stats.wave=50;
      const b=s.waves.boss;b.body.reset(1180,640);b.body.moves=false;b.nextSkill=s.clock+600000;
      window.ultimateBoss=b;s.player.body.reset(960,640);s.player.addUltimateCharge(100);
    });
    for(const multiplier of [1,2]) {
      if(multiplier===2)await page.evaluate(()=>{
        const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();ultimateBoss.health=ultimateBoss.maxHealth;
        s.player.stats.ultimateMultiplier=2;s.player.nextUltimate=0;s.player.addUltimateCharge(100);
      });
      await page.keyboard.press('KeyQ');await expect.poll(async()=>(await state(page)).charge).toBe(0);
      const expected=500000-ultimateDamage[classId].health-ultimateDamage[classId].fixed*multiplier;
      await expect.poll(()=>page.evaluate(()=>ultimateBoss.health),{intervals:[20],timeout:2500}).toBe(expected);
      await page.waitForTimeout(200);
      expect(await page.evaluate(()=>ultimateBoss.health)).toBe(expected);
      expect((await state(page)).charge).toBe(0);expect((await state(page)).kills).toBe(0);
      await page.screenshot({path:`artifacts/ultimate-${classId}-x${multiplier}.png`});
    }
    expect(errors).toEqual([]);
  });
}

for(const method of ['attack','counter','ultimate']) {
  test(`boss death from ${method}: one textured ghost, one shatter/wave lifecycle and one kill, with controls still usable`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page,'warrior');
    const original=await page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=9;s.waves.start(960,640);s.stats.wave=10;
      const b=s.waves.boss;b.body.reset(1040,640);b.body.moves=false;b.nextSkill=s.clock+600000;b.health=1;
      window.deathBoss=b;s.player.body.reset(960,640);return {texture:b.visual.texture.key,x:b.x,y:b.y};
    });
    if(method==='attack')await page.keyboard.down('KeyJ');
    else if(method==='ultimate'){await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').player.addUltimateCharge(100));await page.keyboard.press('KeyQ');}
    else {
      await page.keyboard.press('Space');
      await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game'),b=deathBoss;b.stunUntil=0;b.rushUntil=0;b.skill='ring';b.castStarted=s.clock-300;b.castUntil=s.clock+30;});
    }
    await expect.poll(async()=>(await state(page)).kills,{intervals:[10]}).toBe(1);
    if(method==='attack')await page.keyboard.up('KeyJ');
    await expect(page.locator('.upgrade-card[data-category=core]')).not.toHaveCount(0);
    await page.locator('.upgrade-card[data-category=core]').first().click();
    const first=await state(page),death=effect(first,'boss-death'),ghost=first.effects.find(e=>e.name.startsWith('vfx-boss-ghost-'));
    expect(death.commands).toBeGreaterThan(20);expect(first.effects.filter(e=>e.kind==='boss-death')).toHaveLength(1);
    expect(ghost.texture).toBe(original.texture);expect(ghost.alpha).toBeGreaterThan(0);
    expect(await page.evaluate(()=>deathBoss.active)).toBe(false);
    await page.waitForTimeout(250);const middle=await state(page);expect(effect(middle,'boss-death').elapsed).toBeGreaterThan(death.elapsed);
    await page.screenshot({path:`artifacts/boss-death-${method}-shatter.png`});
    // A destroyed boss cannot award another kill or start another death effect.
    await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.attack([deathBoss],s.clock);});
    expect((await state(page)).kills).toBe(1);expect(effect(await state(page),'boss-death').serial).toBe(death.serial);
    await page.keyboard.press('Escape');const frozen=await state(page);await page.waitForTimeout(150);expect((await state(page)).effects).toEqual(frozen.effects);
    await page.getByTestId('resume').click();
    await expect.poll(async()=>!!effect(await state(page),'boss-death'),{timeout:2300}).toBe(false);
    expect((await state(page)).effects.some(e=>e.name.startsWith('vfx-boss-ghost-'))).toBe(false);expect((await state(page)).kills).toBe(1);
    await page.getByTestId('pause').click();await expect(page.getByTestId('resume')).toBeVisible();expect(errors).toEqual([]);
  });
}
