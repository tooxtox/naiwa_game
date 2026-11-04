import {test,expect} from '@playwright/test';

async function fixture(page) {
  await page.goto('/');await page.getByTestId('class-warrior').click();await page.getByTestId('start').click();
  await expect.poll(()=>page.evaluate(()=>window.__LUMENFALL__?.scene.getScene('Game').player?.active??false)).toBe(true);
  await page.evaluate(()=>{
    const s=window.__LUMENFALL__.scene.getScene('Game');s.pauseRun();
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];s.combat.clear();
    s.player.body.reset(1200,640);s.player.invulnerableUntil=1000000;
  });
}

test('real melee and elite damage boundaries match the displayed floor-space danger radius',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const {ENEMY_TACTICS}=await import('/src/game/systems/EnemyTactics.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game'),p=s.player;
    const nav={lineOfSight:()=>true,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    const melee=new Enemy(s,960,640,'melee',1,nav),circles=[];
    const stroke=melee.tell.strokeCircle.bind(melee.tell);melee.tell.strokeCircle=(x,y,r)=>{circles.push(r);return stroke(x,y,r);};
    let hits=0;const hurt=()=>hits++;
    p.body.reset(1041,640);melee.windupUntil=1100;melee.tick(1100,p,()=>{},hurt);
    const inside=hits;p.body.reset(1043,640);melee.windupUntil=1200;melee.tick(1200,p,()=>{},hurt);
    const outside=hits;melee.destroy();
    const elite=new Enemy(s,960,640,'elite',1,nav);elite.rushingUntil=3000;
    p.body.reset(1022,640);elite.tick(2000,p,()=>{},hurt);const eliteInside=hits;
    p.body.reset(1024,640);elite.tick(2016,p,()=>{},hurt);const eliteOutside=hits;elite.destroy();
    return {inside,outside,eliteInside,eliteOutside,circles,geometry:ENEMY_TACTICS};
  });
  expect(result.inside).toBe(1);expect(result.outside).toBe(1);expect(result.circles).toContain(82);
  expect(result.eliteInside).toBe(2);expect(result.eliteOutside).toBe(2);
  expect(result.geometry.rushSpeed*result.geometry.rushDuration/1000).toBeCloseTo(211.6);
});

test('elite projectiles keep the locked warning direction when the player changes position',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const nav={lineOfSight:()=>true,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    const e=new Enemy(s,960,640,'elite',1,nav);e.configureEncounter(2,0);
    s.player.body.reset(1200,640);e.tick(1000,s.player,()=>{},()=>{});const locked=e.rushAngle,warning=e.windupUntil;
    s.player.body.reset(1100,740);const worldAngles=[];
    e.tick(warning,s.player,(enemy,spread)=>worldAngles.push(Math.atan2((s.player.y-enemy.y)/.72,s.player.x-enemy.x)+spread),()=>{});
    const out={locked,warning,worldAngles,rushingUntil:e.rushingUntil};e.destroy();return out;
  });
  expect(result.locked).toBe(0);expect(result.warning).toBe(1740);
  expect(result.worldAngles[0]).toBeCloseTo(-.36);expect(result.worldAngles[1]).toBeCloseTo(0);expect(result.worldAngles[2]).toBeCloseTo(.36);
  expect(result.rushingUntil).toBe(2200);
});

test('ranged fans keep their warned lanes and solid cover stops close contact damage',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    let clear=true;const nav={lineOfSight:()=>clear,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    const ranged=new Enemy(s,960,640,'ranged',1,nav);ranged.configureEncounter(2,1);s.player.body.reset(1200,640);
    ranged.tick(1000,s.player,()=>{},()=>{});ranged.tick(1140,s.player,()=>{},()=>{});const warning=ranged.windupUntil;s.player.body.reset(1120,740);
    const angles=[];ranged.tick(warning,s.player,(e,spread)=>angles.push(Math.atan2((s.player.y-e.y)/.72,s.player.x-e.x)+spread),()=>{});ranged.destroy();
    clear=false;s.player.body.reset(1010,640);const melee=new Enemy(s,960,640,'melee',1,nav);melee.windupUntil=2000;
    let hits=0;melee.tick(2000,s.player,()=>{},()=>hits++);melee.destroy();
    const elite=new Enemy(s,960,640,'elite',1,nav);elite.rushingUntil=3000;elite.tick(2100,s.player,()=>{},()=>hits++);elite.destroy();
    return {warning,angles,hits};
  });
  expect(result.warning).toBe(1780);expect(result.angles[0]).toBeCloseTo(-.32);expect(result.angles[1]).toBeCloseTo(0);expect(result.angles[2]).toBeCloseTo(.32);expect(result.hits).toBe(0);
});

test('unreachable enemies and bosses throttle failed path searches rather than running A star every frame',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts'),{Boss}=await import('/src/game/entities/Boss.ts');
    const s=window.__LUMENFALL__.scene.getScene('Game');let paths=0;
    const nav={lineOfSight:()=>false,clearLine:()=>false,route:()=>{paths++;return [];}};
    const e=new Enemy(s,600,640,'melee',1,nav);s.player.body.reset(1200,640);
    for(let time=1000;time<1650;time+=16)e.tick(time,s.player,()=>{},()=>{});
    const enemyPaths=paths;e.destroy();paths=0;
    const b=new Boss(s,600,640,50,nav);for(let time=1000;time<1650;time+=16)b.tick(time,s.player,()=>{},()=>{});
    const bossPaths=paths;b.destroy();return {enemyPaths,bossPaths};
  });
  expect(result).toEqual({enemyPaths:1,bossPaths:1});
});

test('ranged recovery strafes while nearby melee fighters choose separated approach lanes',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const nav={lineOfSight:()=>true,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    s.player.body.reset(1200,640);const r=new Enemy(s,950,640,'ranged',1,nav);r.nextAttack=10000;r.tick(1000,s.player,()=>{},()=>{});
    const ranged={vx:r.body.velocity.x,vy:r.body.velocity.y};r.destroy();
    const a=new Enemy(s,1000,640,'melee',1,nav),b=new Enemy(s,1000,640,'melee',1,nav);a.configureEncounter(1,0);b.configureEncounter(1,1);
    a.tick(1000,s.player,()=>{},()=>{});b.tick(1000,s.player,()=>{},()=>{});
    const melee=[a.body.velocity.y,b.body.velocity.y];a.destroy();b.destroy();return {ranged,melee};
  });
  expect(Math.abs(result.ranged.vy)).toBeGreaterThan(30);expect(result.melee[0]).toBeGreaterThan(0);expect(result.melee[1]).toBeLessThan(0);
});

test('five guardians change phase tactics, advanced volleys keep safe lanes and remain bounded',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {BOSSES}=await import('/src/game/config.ts');const {bossPattern,bossFanOffsets,bossRingOffsets}=await import('/src/game/systems/BossPatterns.ts');
    return [10,20,30,40,50].map(wave=>({wave,first:bossPattern(wave,1,BOSSES[wave].patterns),second:bossPattern(wave,2,BOSSES[wave].patterns),fan:bossFanOffsets(wave,2),ring:bossRingOffsets(wave,2,3)}));
  });
  for(const sample of result){expect(sample.second).not.toEqual(sample.first);expect(sample.fan.length).toBeLessThanOrEqual(9);expect(sample.ring.length).toBeLessThanOrEqual(14);}
  expect(result.find(s=>s.wave===20).fan).not.toContain(0);
  for(const wave of [30,40,50])for(const angle of result.find(s=>s.wave===wave).ring)expect(Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))).toBeGreaterThanOrEqual(.4);
});

test('a real charge ends in recovery without the old untelegraphed instant ring',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Boss}=await import('/src/game/entities/Boss.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const nav={lineOfSight:()=>true,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    const b=new Boss(s,960,640,10,nav);s.player.body.reset(1200,640);b.rushUntil=1500;b.nextSkill=10000;
    const shots=[];b.tick(1501,s.player,(e,spread)=>shots.push(spread),()=>{});
    const out={shots,cast:b.castUntil,rush:b.rushUntil,next:b.nextSkill};b.destroy();return out;
  });
  expect(result.shots).toEqual([]);expect(result.rush).toBe(0);expect(result.cast).toBe(0);expect(result.next).toBeGreaterThanOrEqual(2101);
});

test('final phase has a finite cross hazard with full warning and reachable diagonal exits',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Boss}=await import('/src/game/entities/Boss.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const nav={lineOfSight:()=>true,clearLine:()=>true,route:(x,y,tx,ty)=>[{x:tx,y:ty}]};
    const b=new Boss(s,960,640,50,nav);s.player.body.reset(1200,640);b.health=b.maxHealth*.24;
    let phases=0;s.events.on('boss-phase',()=>phases++);b.tick(1000,s.player,()=>{},()=>{});
    const resetIndex=b.skillIndex;b.skillIndex=1;b.nextSkill=0;b.tick(2001,s.player,()=>{},()=>{});
    const hazards=b.hazards.map(h=>({...h})),diagonal={x:1200+180,y:640+180*.72};
    const out={phase:b.bossPhase,phases,resetIndex,skill:b.skill,warning:b.castUntil-b.castStarted,count:hazards.length,diagonalSafe:hazards.every(h=>Math.hypot(diagonal.x-h.x,(diagonal.y-h.y)/.72)>h.radius),escapeDistance:Math.hypot(180,180),hint:b.phaseHint};
    b.tick(2100,s.player,()=>{},()=>{});out.phasesAfter=phases;b.destroy();return out;
  });
  expect(result.phase).toBe(3);expect(result.phases).toBe(1);expect(result.phasesAfter).toBe(1);expect(result.resetIndex).toBe(0);
  expect(result.skill).toBe('meteor');expect(result.warning).toBe(1150);expect(result.count).toBe(5);expect(result.diagonalSafe).toBe(true);
  expect(result.escapeDistance).toBeLessThan(255*result.warning/1000);expect(result.hint).toContain('红温过载');
});

test('cache guardian alternates horizontal and vertical ground patterns on successive casts',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Boss}=await import('/src/game/entities/Boss.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const b=new Boss(s,960,640,30,s.waves.nav);b.bossPhase=2;s.player.body.reset(1200,640);
    b.prepareHazards(s.player);const first=b.hazards.map(h=>({x:h.x,y:h.y}));
    b.prepareHazards(s.player);const second=b.hazards.map(h=>({x:h.x,y:h.y}));b.destroy();return {first,second};
  });
  expect(result.first).toHaveLength(3);expect(result.second).toHaveLength(3);
  expect(result.first.slice(1).every(h=>h.y===640&&h.x!==1200)).toBe(true);
  expect(result.second.slice(1).every(h=>Math.abs(h.x-1200)<.01&&h.y!==640)).toBe(true);
});

test('boss percentage-health damage does not inherit break amplification and invalid damage stays harmless',async({page})=>{
  await fixture(page);
  const result=await page.evaluate(async()=>{
    const {Boss}=await import('/src/game/entities/Boss.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    const b=new Boss(s,960,640,50,s.waves.nav);b.damageToughness(b.maxToughness,1000);const before=b.health;
    b.hit(100,0,1000,8000);const dealt=before-b.health,after=b.health;
    for(const [flat,percent] of [[Infinity,0],[-1,0],[0,NaN],[1,-10]])b.hit(flat,0,1000,percent);
    const unchanged=b.health===after;b.destroy();return {dealt,unchanged};
  });
  expect(result).toEqual({dealt:8135,unchanged:true});
});
