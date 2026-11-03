import { test, expect } from '@playwright/test';

test('target priorities: reachable in-range enemies, stable lock, invalidation and unobstructed fallback',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {TargetingSystem}=await import('/src/game/systems/TargetingSystem.ts');
    const targeting=new TargetingSystem();
    const a={x:50,y:0,active:true,state:'Chase',id:'covered'},b={x:90,y:0,active:true,state:'Chase',id:'clear'},c={x:95,y:0,active:true,state:'Chase',id:'second'};
    const visible=t=>t!==a,select=now=>targeting.choose([a,b,c],0,0,130,.72,now,visible)?.id;
    const first=select(0);c.x=85;const stable=select(16);b.active=false;const dead=select(32);
    c.x=500;a.x=60;const fallback=select(48);c.active=false;const coveredFallback=select(64);
    a.state='Dead';const empty=select(400);return{first,stable,dead,fallback,coveredFallback,empty};
  });
  expect(result).toEqual({first:'clear',stable:'clear',dead:'second',fallback:'second',coveredFallback:'covered',empty:undefined});
});

test('real cover blocks the closer candidate while a clear target receives a normal magic attack',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await page.getByTestId('class-mage').click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').combat?.target?.active??false)).toBe(true);
  const fixture=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player;s.combat.clear();
    const box=s.combat.solids.find(b=>b.left>300&&b.right<1600&&b.top>300&&b.bottom<1000);
    const y=(box.top+box.bottom)/2,x=box.left-55;p.body.reset(x,y);p.invulnerableUntil=s.clock+10000;p.stats.critChance=0;
    s.waves.enemies.forEach((e,i)=>{e.body.moves=false;e.stun(s.clock,600000);e.health=e.maxHealth=1000;e.body.reset(i===0?box.right+10:i===1?x:1800,i===0?y:i===1?y+170*.72:1150);});
    window.coverTargets=s.waves.enemies.slice(0,2);s.combat.acquireTarget(s.waves.enemies,s.clock);
    return {covered:s.combat.obstacleTime(x,y,coverTargets[0].x,coverTargets[0].y)<=1,clear:s.combat.obstacleTime(x,y,coverTargets[1].x,coverTargets[1].y)===Infinity,selected:s.combat.target===coverTargets[1]};
  });
  expect(fixture).toEqual({covered:true,clear:true,selected:true});
  await page.keyboard.press('KeyJ',{delay:35});
  await expect.poll(()=>page.evaluate(()=>coverTargets[1].health),{timeout:2000}).toBeLessThan(1000);
  expect(await page.evaluate(()=>coverTargets[0].health)).toBe(1000);expect(errors).toEqual([]);
});

test('reduced feedback suppresses hit stop and shaking; ordinary feedback has a short bounded lifetime',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {HitStop,cameraShake}=await import('/src/game/systems/CombatFeedback.ts');
    const {setPreference}=await import('/src/game/systems/Preferences.ts');
    const stop=new HitStop(),calls=[];const fake={cameras:{main:{shake:(...args)=>calls.push(args)}}};
    setPreference('reducedMotion',false);setPreference('reducedShake',false);stop.request(200,1000);
    const capped=stop.remaining;const frozen=stop.consume(16);stop.consume(40);const ended=stop.remaining;
    cameraShake(fake,1000,.1);setPreference('reducedShake',true);cameraShake(fake,90,.003);
    setPreference('reducedMotion',true);stop.request(500,45);
    return{capped,frozen,ended,reduced:stop.remaining,calls};
  });
  expect(result).toEqual({capped:45,frozen:true,ended:0,reduced:0,calls:[[180,.004]]});
});

test('fully upgraded counter never multiplies the final boss percentage HP component',async({page})=>{
  await page.goto('/');await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>!!window.__LUMENFALL__.scene.getScene('Game').combat)).toBe(true);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=49;s.waves.start(960,640);
    const b=s.waves.boss;b.body.reset(1040,640);b.body.moves=false;b.nextSkill=s.clock+600000;s.player.body.reset(960,640);
    for(let i=0;i<3;i++)s.upgrades.build.learnCore('warrior-counter');for(let i=0;i<8;i++)s.upgrades.build.learnSupport('warrior-counter-force');
    s.combat.acquireTarget(s.waves.enemies,s.clock);
  });
  await page.keyboard.press('Space');await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').player.guarding)).toBe(true);
  const result=await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss;s.combat.hurt(90,b.x,s.clock,b.y,b);
    return{health:b.health,toughness:b.toughness,max:b.maxToughness,ratio:s.upgrades.build.effects().counterDamageMultiplier,result:s.player.lastDamageResult};
  });
  expect(result.result).toBe('parried');expect(result.ratio).toBeCloseTo(4.45);
  expect(result.health).toBe(100000-Math.round(6000+48*4.45));expect(result.toughness).toBe(result.max-64);
});

test('boss frost uses its own real duration and cooldown instead of the generic 220ms stun cap',async({page})=>{
  await page.goto('/');await page.getByTestId('class-mage').click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>!!window.__LUMENFALL__.scene.getScene('Game').combat)).toBe(true);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.combat.clear();s.waves.wave=9;s.waves.start(960,640);
    const b=s.waves.boss;b.body.reset(1060,640);b.body.moves=false;b.nextSkill=s.clock+600000;
    s.player.body.reset(960,640);s.player.invulnerableUntil=s.clock+600000;s.player.stats.critChance=0;s.player.stats.attackCooldown=100;
    s.upgrades.build.learnCore('mage-freeze');s.upgrades.build.learnCore('mage-freeze');
  });
  await page.keyboard.down('KeyJ');
  await expect.poll(()=>page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return !!s.combat.frost.get(s.waves.boss)?.immuneUntil;}),{intervals:[10]}).toBe(true);
  await page.keyboard.up('KeyJ');
  const result=await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game'),b=s.waves.boss,status=s.combat.frost.get(b),start=status.immuneUntil-5000;const duration=b.stunUntil-start,until=b.stunUntil;b.freeze(start+100,395);return{duration,unchanged:until===b.stunUntil};});
  expect(result.duration).toBeCloseTo(230,6);expect(result.unchanged).toBe(true);
});

test('sparse maze layouts cap encounter count and never fall back to near or duplicate spawns',async({page})=>{
  await page.goto('/');await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>!!window.__LUMENFALL__.scene.getScene('Game').combat)).toBe(true);
  const result=await page.evaluate(async()=>{
    const [{MapGenerator},{ChapterSystem},{WaveSystem}]=await Promise.all([import('/src/game/systems/MapGenerator.ts'),import('/src/game/systems/ChapterSystem.ts'),import('/src/game/systems/WaveSystem.ts')]);
    const s=window.__LUMENFALL__.scene.getScene('Game'),before=new Set(s.children.list),map=new MapGenerator(s,'1VG85').create(),chapter=new ChapterSystem(s,map.platforms,'1VG85');
    chapter.setChapter(21,{x:1050,y:571});const waves=new WaveSystem(s,s.waves.random,map.platforms,map.spawnPoints);waves.wave=20;waves.start(1050,571);
    const points=waves.alive.map(e=>[e.x,e.y]),output={count:points.length,unique:new Set(points.map(p=>p.join(','))).size,distances:points.map(([x,y])=>Math.hypot(x-1050,(y-571)/.72))};
    waves.enemies.forEach(e=>e.active&&e.destroy());chapter.destroy();map.platforms.clear(true,true);map.platforms.destroy();
    for(const object of s.children.list.slice())if(!before.has(object)&&object.scene)object.destroy();return output;
  });
  expect(result.count).toBeGreaterThan(0);expect(result.count).toBeLessThanOrEqual(15);expect(result.unique).toBe(result.count);expect(result.distances.every(d=>d>285)).toBe(true);
});
