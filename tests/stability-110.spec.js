import {test,expect} from '@playwright/test';

async function start(page) {
  await page.addInitScript(()=>{
    Object.defineProperty(crypto,'getRandomValues',{value:array=>{for(let i=0;i<array.length;i++)array[i]=0x711100+i;return array;}});
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,active=[];
    const capture=options=>typeof options==='boolean'?options:!!options?.capture;
    const watched=new Set(['keydown','keyup','blur','visibilitychange','resize','pointerup','pointermove','pointercancel','fullscreenchange','webkitfullscreenchange','naiwasettingschange']);
    EventTarget.prototype.addEventListener=function(type,listener,options){
      if((this===window||this===document)&&listener&&watched.has(type)&&!active.some(e=>e.target===this&&e.type===type&&e.listener===listener&&e.capture===capture(options)))active.push({target:this,type,listener,capture:capture(options)});
      return add.call(this,type,listener,options);
    };
    EventTarget.prototype.removeEventListener=function(type,listener,options){
      const index=active.findIndex(e=>e.target===this&&e.type===type&&e.listener===listener&&e.capture===capture(options));if(index>=0)active.splice(index,1);
      return remove.call(this,type,listener,options);
    };
    window.__stabilityListeners=()=>{
      const counts={};for(const e of active){const key=`${e.target===window?'window':'document'}:${e.type}`;counts[key]=(counts[key]??0)+1;}return counts;
    };
  });
  await page.goto('/');await page.getByTestId('class-mage').click();await page.getByTestId('start').click();
  await page.waitForFunction(()=>window.__LUMENFALL__?.scene.getScene('Game').player?.active);
}
async function settle(page,frames=8) {
  await page.evaluate(count=>new Promise(resolve=>{let left=count;const tick=()=>--left<=0?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),frames);
}
async function restart(page) {
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');window.__oldPlayer=s.player;s.scene.restart({classId:'mage',runMode:'campaign'});});
  await page.waitForFunction(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return s.mode==='playing'&&s.player?.active&&s.player!==window.__oldPlayer;});
  await page.evaluate(()=>delete window.__oldPlayer);await settle(page);
}
async function readResources(page) {
  return page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');
    return {children:s.children.list.length,bodies:s.physics.world.bodies.size,staticBodies:s.physics.world.staticBodies.size,colliders:s.physics.world.colliders.getActive().length,
      bullets:s.combat.bullets.getLength(),projectiles:s.combat.projectiles.length,motes:s.effects.pool.length,labels:s.effects.labels.length,visuals:s.effects.visuals.length,ghosts:s.effects.bossGhosts.length,
      huds:document.querySelectorAll('.lumen-ui').length,touchRoots:document.querySelectorAll('[data-testid="touch-controls"]').length,
      globalListeners:window.__stabilityListeners(),sceneListeners:Object.fromEntries(s.events.eventNames().filter(n=>typeof n==='string').map(n=>[n,s.events.listenerCount(n)]))};
  });
}

test('eight scene restarts keep listeners, physics colliders and fixed visual/projectile pools bounded',async({page})=>{
  await start(page);await restart(page);await restart(page);const first=await readResources(page);
  expect(first).toMatchObject({bullets:96,projectiles:64,motes:100,labels:12,visuals:24,ghosts:2,huds:1,touchRoots:1});
  const snapshots=[];
  for(let i=0;i<8;i++){await restart(page);snapshots.push(await readResources(page));}
  for(const snapshot of snapshots)expect(snapshot).toEqual(first);
});

test('held keyboard and independent touch pointers are cleared when a run is restarted',async({browser})=>{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const page=await context.newPage();await start(page);
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');s.player.invulnerableUntil=1000000;window.__oldControls=s.controls;});
  const cdp=await context.newCDPSession(page),box=await page.getByTestId('touch-attack').boundingBox(),attack={id:2,x:box.x+box.width/2,y:box.y+box.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:130,y:250}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:160,y:225}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:160,y:225},attack]});
  await page.keyboard.down('KeyD');
  expect(await page.evaluate(()=>{const c=window.__oldControls;return c.axisX>0&&c.axisY<0&&c.attackHeld;})).toBe(true);
  await restart(page);
  expect(await page.evaluate(()=>{
    const old=window.__oldControls,s=window.__LUMENFALL__.scene.getScene('Game');
    return {oldAxis:[old.axisX,old.axisY],oldAttack:old.attackHeld,oldConnected:old.touch.element.isConnected,oldPointer:old.touch.joystick.pointerId,oldButtons:old.touch.buttons.size,newAxis:[s.controls.axisX,s.controls.axisY],newAttack:s.controls.attackHeld,newPointers:[...s.controls.touch.buttons.values()].map(b=>b.pointerId)};
  })).toEqual({oldAxis:[0,0],oldAttack:false,oldConnected:false,oldPointer:null,oldButtons:0,newAxis:[0,0],newAttack:false,newPointers:[null,null,null,null]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.keyboard.up('KeyD');
  await expect(page.getByTestId('joystick-base')).toBeHidden();await page.evaluate(()=>delete window.__oldControls);await context.close();
});

test('burst stress and timeout cleanup never expand the fixed particle, skill and projectile pools',async({page})=>{
  await start(page);
  const result=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.pauseRun();s.player.invulnerableUntil=1000000;
    s.waves.enemies.forEach(e=>{e.stun(s.clock,1000000);e.health=e.maxHealth=1000000;});
    s.player.stats.projectileCount=7;s.player.stats.critChance=0;
    const sizes=()=>({motes:s.effects.pool.length,labels:s.effects.labels.length,visuals:s.effects.visuals.length,projectiles:s.combat.projectiles.length,bullets:s.combat.bullets.getLength()});
    const before=sizes();
    for(let i=0;i<150;i++){
      s.effects.burst(960,640,0x8edfc2,20,100);s.effects.skill(i%2?'impact':'attack',960,616,0,0xffdf8a,'mage',100);s.effects.number(1020,620,24,i%5===0);
      s.combat.attack(s.waves.enemies,s.clock);s.combat.fire(s.waves.enemies[0],i*.1,s.clock);
    }
    const saturated={...sizes(),activeMotes:s.effects.pool.filter(p=>p.life>0).length,activeVisuals:s.effects.visuals.filter(p=>p.duration>0).length,activeProjectiles:s.combat.projectiles.filter(p=>p.active).length};
    s.combat.tick(s.clock+6000,s.waves.enemies);s.effects.tick(6000);
    const expired={motes:s.effects.pool.filter(p=>p.life>0).length,labels:s.effects.labels.filter(p=>p.life>0).length,visuals:s.effects.visuals.filter(p=>p.duration>0).length,projectiles:s.combat.projectiles.filter(p=>p.active).length,bullets:s.combat.bullets.getChildren().filter(p=>p.active).length};
    s.combat.clear();return {before,after:sizes(),saturated,expired};
  });
  expect(result.before).toEqual({motes:100,labels:12,visuals:24,projectiles:64,bullets:96});expect(result.after).toEqual(result.before);
  expect(result.saturated.activeMotes).toBe(100);expect(result.saturated.activeVisuals).toBeLessThanOrEqual(22);expect(result.saturated.activeProjectiles).toBe(64);
  expect(result.expired).toEqual({motes:0,labels:0,visuals:0,projectiles:0,bullets:0});
});
