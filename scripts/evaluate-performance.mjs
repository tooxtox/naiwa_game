import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus,platform,release,totalmem} from 'node:os';
import {execFileSync} from 'node:child_process';

const args=process.argv.slice(2);
const option=(name,fallback)=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const baselineUrl=option('baseline','http://127.0.0.1:8090');
const candidateUrl=option('candidate','http://127.0.0.1:8080');
const frameCount=Number(option('frames','360'));
const restarts=Number(option('restarts','8'));
const output=option('output','artifacts/performance-110.json');
if(!Number.isInteger(frameCount)||frameCount<60||!Number.isInteger(restarts)||restarts<2)throw new Error('Use at least 60 frames and two restarts.');
const sourceFiles=['src/game/config.ts','src/game/entities/Enemy.ts','src/game/entities/Boss.ts','src/game/scenes/GameScene.ts','src/game/systems/CombatSystem.ts','src/game/systems/CombatBalance.ts','src/game/systems/EnemyTactics.ts','src/game/systems/BossPatterns.ts','src/game/systems/InputManager.ts','src/game/ui/HUD.ts','src/game/ui/hud.css','src/game/ui/TouchControls.ts','src/game/ui/controls.css'];

const summarize=values=>{
  const sorted=values.slice().sort((a,b)=>a-b),sum=sorted.reduce((a,b)=>a+b,0);
  const at=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]??0;
  return {count:sorted.length,mean:sum/Math.max(1,sorted.length),p50:at(.5),p95:at(.95),p99:at(.99),maximum:sorted.at(-1)??0};
};
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,hash(await readFile(file))])));
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--mute-audio']});

async function settle(page,frames=8) {
  await page.evaluate(count=>new Promise(resolve=>{let left=count;const tick=()=>--left<=0?resolve():requestAnimationFrame(tick);requestAnimationFrame(tick);}),frames);
}
async function restart(page) {
  await page.evaluate(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');window.__perfPreviousPlayer=s.player;s.scene.restart({classId:'mage',runMode:'campaign'});});
  await page.waitForFunction(()=>{const s=window.__LUMENFALL__.scene.getScene('Game');return s.mode==='playing'&&s.player?.active&&s.player!==window.__perfPreviousPlayer;});
  await page.evaluate(()=>delete window.__perfPreviousPlayer);await settle(page);
  await page.evaluate(()=>window.__LUMENFALL__.scene.getScene('Game').pauseRun());
}
async function resources(page,cdp,cycle) {
  await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');
  const [metrics,dom,objects]=await Promise.all([
    cdp.send('Performance.getMetrics'),cdp.send('Memory.getDOMCounters'),
    page.evaluate(()=>{
      const s=window.__LUMENFALL__.scene.getScene('Game'),world=s.physics.world;
      return {sceneChildren:s.children.list.length,dynamicBodies:world.bodies.size,staticBodies:world.staticBodies.size,colliders:world.colliders.getActive().length,
        bulletPool:s.combat.bullets.getLength(),projectilePool:s.combat.projectiles.length,motePool:s.effects.pool.length,damageLabelPool:s.effects.labels.length,visualPool:s.effects.visuals.length,bossGhostPool:s.effects.bossGhosts.length,
        hudRoots:document.querySelectorAll('.lumen-ui').length,touchRoots:document.querySelectorAll('[data-testid="touch-controls"]').length,
        sceneListeners:Object.fromEntries(s.events.eventNames().filter(name=>typeof name==='string').map(name=>[name,s.events.listenerCount(name)]))};
    })
  ]);
  return {cycle,heapUsedBytes:metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value??null,dom,...objects};
}

async function measure(label,url) {
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  await context.addInitScript(()=>{
    localStorage.clear();
    Object.defineProperty(crypto,'getRandomValues',{value:array=>{for(let i=0;i<array.length;i++)array[i]=0x711100+i;return array;}});
    let state=0x711100;Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  await page.goto(url);await page.getByTestId('class-mage').click();await page.getByTestId('start').click();
  await page.waitForFunction(()=>window.__LUMENFALL__?.scene.getScene('Game').player?.active);
  const fixture=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts');
    const game=window.__LUMENFALL__,s=game.scene.getScene('Game');s.combat.clear();s.controls.reset();
    s.waves.enemies.forEach(e=>e.active&&e.destroy());s.waves.enemies=[];
    s.player.body.reset(960,640);s.player.invulnerableUntil=100000000;
    Object.assign(s.player.stats,{attackCooldown:300,projectileCount:3,critChance:0,damage:24,splashRadius:86,pierceCount:1});
    s.waves.wave=9;s.stats.wave=9;s.audio?.setBgmPaused(true);s.audio=null;s.combat.audio=null;
    const points=s.waves.spawnPoints.filter(p=>Math.hypot(p.x-960,(p.y-640)/.72)>310).slice().sort((a,b)=>Math.hypot(a.x-960,(a.y-640)/.72)-Math.hypot(b.x-960,(b.y-640)/.72)).slice(0,15);
    if(points.length!==15)throw new Error('The fixed seed no longer supplies 15 safe enemy positions.');
    points.forEach((point,i)=>{
      const kind=i%5===4?'elite':i%2===0?'ranged':'melee';
      const e=new Enemy(s,point.x,point.y,kind,9,s.waves.nav);e.health=e.maxHealth=1000000;e.configureEncounter(2,i);
      s.waves.bindCollision(e);s.waves.enemies.push(e);
    });
    const gl=game.renderer.gl,extension=gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer=gl?{vendor:gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL??gl.VENDOR),renderer:gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)}:{renderer:'Canvas'};
    const geometry=s.mapPlatforms.getChildren().map(o=>({x:o.body.left,y:o.body.top,width:o.body.width,height:o.body.height}));
    const actors=s.waves.enemies.map(e=>({x:e.x,y:e.y,kind:e.kind,maxHealth:e.maxHealth}));
    const state={updates:[],fixtureCosts:[],frameIntervals:[],counts:[],frames:0,active:true,measuring:false,nextBurst:s.clock,burstSerial:0};
    // Phaser caches the user update callback in Systems.sceneUpdate at boot.
    // Wrapping scene.update alone would silently collect zero real calls.
    window.__perfCapture=state;const original=s.sys.sceneUpdate;
    window.__perfRestore=()=>{s.sys.sceneUpdate=original;delete window.__perfCapture;delete window.__perfRestore;};
    s.sys.sceneUpdate=function(time,delta){
      const workloadStart=performance.now();
      if(this.mode==='playing'&&this.clock>=state.nextBurst){
        const serial=state.burstSerial++;
        for(let j=0;j<6;j++)this.combat.fire(this.waves.enemies[(serial+j)%15],(j-2.5)*.18,this.clock);
        this.effects.burst(960+(serial%3-1)*100,590,0xffd27b,8,110);
        this.effects.skill(serial%2?'impact':'counter',960,616,0,0x8edfc2,'mage',100);
        this.effects.number(1040,620,24,serial%4===0);state.nextBurst=this.clock+250;
      }
      const updateStart=performance.now();original.call(this,time,delta);const end=performance.now();
      if(state.measuring){state.updates.push(end-updateStart);state.fixtureCosts.push(updateStart-workloadStart);}
      if(state.measuring&&state.frames%30===0)state.counts.push({mode:this.mode,clock:this.clock,enemies:this.waves.alive.length,bullets:this.combat.bullets.getChildren().filter(b=>b.active).length,projectiles:this.combat.projectiles.filter(p=>p.active).length,motes:this.effects.pool.filter(m=>m.life>0).length,visuals:this.effects.visuals.filter(v=>v.duration>0).length});
    };
    window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',bubbles:true}));
    return {seed:s.stats.seed,renderer,geometry,actors,stats:{...s.player.stats},pools:{hostile:s.combat.bullets.getLength(),player:s.combat.projectiles.length,motes:s.effects.pool.length,labels:s.effects.labels.length,visuals:s.effects.visuals.length,ghosts:s.effects.bossGhosts.length}};
  });
  await settle(page,60);
  const samples=await page.evaluate(count=>new Promise(resolve=>{
    const state=window.__perfCapture;state.measuring=true;let previous=0;
    const tick=time=>{
      if(previous)state.frameIntervals.push(time-previous);previous=time;state.frames++;
      if(state.frames<count)requestAnimationFrame(tick);
      else{state.measuring=false;window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyJ',bubbles:true}));resolve({updates:state.updates,fixtureCosts:state.fixtureCosts,frameIntervals:state.frameIntervals,counts:state.counts});}
    };requestAnimationFrame(tick);
  }),frameCount);
  if(samples.updates.length<frameCount*.75||samples.counts.some(sample=>sample.mode!=='playing'||sample.enemies!==15))throw new Error(`${label}: the live scene workload did not keep running; inspect scene-update instrumentation or a pause/reward interruption.`);
  await page.screenshot({path:`artifacts/performance-${label}.png`});
  await page.evaluate(()=>{window.__perfRestore();window.__LUMENFALL__.scene.getScene('Game').pauseRun();});
  const navigation=await page.evaluate(async()=>{
    const {Enemy}=await import('/src/game/entities/Enemy.ts'),s=window.__LUMENFALL__.scene.getScene('Game');
    let routeRequests=0;const fake={lineOfSight:()=>false,clearLine:()=>false,route:()=>{routeRequests++;return [];}};
    const e=new Enemy(s,250,300,'melee',1,fake);e.configureEncounter(1,0);s.player.body.reset(960,640);
    const started=performance.now();for(let i=0;i<600;i++)e.tick(100000+i*1000/60,s.player,()=>{},()=>{});
    const fakeDuration=performance.now()-started;e.destroy();
    const nav=s.waves.nav,targets=s.waves.spawnPoints.filter(p=>!nav.clearLine(960,640,p.x,p.y)),durations=[],lengths=[];
    for(let i=0;i<120;i++){
      const p=targets[i%targets.length]??{x:1600,y:1000},start=performance.now(),path=nav.route(960,640,p.x,p.y);
      durations.push(performance.now()-start);lengths.push(path.length);
    }
    return {failedPathFixture:{ticks:600,simulatedMilliseconds:600*1000/60,routeRequests,fixtureCpuMilliseconds:fakeDuration,usesActualAStar:false},realNavigation:{requests:120,obstructedTargets:targets.length,durations,lengths,usesActualAStar:true}};
  });
  // Restore a fresh run twice before the measured restart series, so first-load
  // texture/JIT/cache allocation is not mistaken for retained scene objects.
  await restart(page);await restart(page);
  const memory=[];memory.push(await resources(page,cdp,0));
  for(let cycle=1;cycle<=restarts;cycle++){await restart(page);memory.push(await resources(page,cdp,cycle));}
  const resourceShape=sample=>{const {cycle,heapUsedBytes,dom,...objects}=sample;return objects;};
  const result={label,url,fixture:{...fixture,geometrySha256:hash(JSON.stringify(fixture.geometry)),actorsSha256:hash(JSON.stringify(fixture.actors))},
    updateCpuMilliseconds:summarize(samples.updates),fixtureInjectionCpuMilliseconds:summarize(samples.fixtureCosts),rafIntervalMilliseconds:summarize(samples.frameIntervals),samples,
    navigation:{...navigation,realNavigation:{...navigation.realNavigation,cpuMilliseconds:summarize(navigation.realNavigation.durations)}},memory,
    restartTrend:{firstHeapBytes:memory[0].heapUsedBytes,lastHeapBytes:memory.at(-1).heapUsedBytes,deltaHeapBytes:memory.at(-1).heapUsedBytes-memory[0].heapUsedBytes,firstDom:memory[0].dom,lastDom:memory.at(-1).dom,resourceCountsStable:memory.every(sample=>JSON.stringify(resourceShape(sample))===JSON.stringify(resourceShape(memory[0]))),domCountsStable:memory.every(sample=>JSON.stringify(sample.dom)===JSON.stringify(memory[0].dom))},errors};
  await context.close();return result;
}

try {
  await mkdir('artifacts',{recursive:true});
  const initialSourceSha256=await sourceHashes();
  console.log('Measuring isolated 1.0.0 baseline…');const baseline=await measure('baseline',baselineUrl);
  console.log('Measuring 1.1.0 candidate…');const candidate=await measure('candidate',candidateUrl);
  const sourceSha256=await sourceHashes(),sourcesUnchanged=JSON.stringify(initialSourceSha256)===JSON.stringify(sourceSha256);
  const results={schemaVersion:1,generatedAt:new Date().toISOString(),environment:{platform:platform(),release:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem(),node:process.version,browser:browser.version(),viewport:{width:844,height:390,deviceScaleFactor:1},headless:true,softwareRenderingRequested:true,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256},
    method:{measuredRafCallbacks:frameCount,restartsAfterTwoWarmups:restarts,seed:'crypto integer 0x711100',fixture:'15 real enemies: six ranged, six melee, three elite; one-million HP prevents kills/reward interruptions; mage holds three-projectile attack every 300ms; six additional hostile shots, eight pooled motes, one local skill and one number every 250ms of combat clock.',timing:'performance.now around the real GameScene.update; fixture injection timed separately; requestAnimationFrame callback intervals include desktop software rendering and browser scheduling. Samples run sequentially, without CPU throttling. Audio output and in-game audio calls disabled in both fixtures.',memory:'Chrome DevTools Protocol Performance.getMetrics and Memory.getDOMCounters after two HeapProfiler.collectGarbage calls per paused fresh run.',limitations:['Synthetic automated workload, not human play or Android/iOS measurements.','rAF intervals are desktop headless observations, not claims of phone FPS.','Scene-update timing excludes physics steps/render submission outside GameScene.update.','Failed-path fixture replaces route with an empty result to count throttling; actual navigation timings are reported separately.','Short repeated restarts can detect obvious retained resources but do not establish hours-long memory stability.','Single sequential sample per build: timing changes may include operating-system and JIT noise.']},
    sourcesUnchanged,fixtureMatches:{geometry:baseline.fixture.geometrySha256===candidate.fixture.geometrySha256,actors:baseline.fixture.actorsSha256===candidate.fixture.actorsSha256,stats:JSON.stringify(baseline.fixture.stats)===JSON.stringify(candidate.fixture.stats)},baseline,candidate};
  await writeFile(output,JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify({output,fixtureMatches:results.fixtureMatches,baseline:{update:baseline.updateCpuMilliseconds,raf:baseline.rafIntervalMilliseconds,failedRoutes:baseline.navigation.failedPathFixture.routeRequests,heapDelta:baseline.restartTrend.deltaHeapBytes},candidate:{update:candidate.updateCpuMilliseconds,raf:candidate.rafIntervalMilliseconds,failedRoutes:candidate.navigation.failedPathFixture.routeRequests,heapDelta:candidate.restartTrend.deltaHeapBytes}},null,2));
  if(!sourcesUnchanged||!Object.values(results.fixtureMatches).every(Boolean)||baseline.errors.length||candidate.errors.length)process.exitCode=1;
} finally {await browser.close();}
