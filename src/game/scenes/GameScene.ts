import * as Phaser from 'phaser';
import { WORLD, CLASSES, UPGRADE_RULES, isClassId, type ClassId, type RunStats, type HUDState, type RunMode } from '../config';
import type { Enemy } from '../entities/Enemy';
import { ChapterSystem } from '../systems/ChapterSystem';
import { CHAPTERS } from '../systems/ChapterSystem';
import { chapterForWave, isBossWave } from '../systems/CampaignPacing';
import { RunTelemetry, type ResolvedDefense, type ResolvedHit } from '../systems/RunSummary';
import { cameraShake } from '../systems/CombatFeedback';
import { recordRun } from '../systems/RunRecords';
import { Player } from '../entities/Player';
import { InputManager } from '../systems/InputManager';
import { MapGenerator } from '../systems/MapGenerator';
import { CombatSystem } from '../systems/CombatSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { Effects } from '../systems/Effects';
import { AudioManager } from '../systems/AudioManager';
import { RewardRoom } from '../systems/RewardRoom';
import { HUD } from '../ui/HUD';
import { THEME, ENEMY_NAMES } from '../theme';
export type GameMode='playing'|'paused'|'upgrade'|'dead'|'reward'|'victory';
export class GameScene extends Phaser.Scene {
  player:Player;
  controls:InputManager;
  combat:CombatSystem;
  waves:WaveSystem;
  upgrades:UpgradeSystem;
  hud:HUD;
  effects:Effects;
  audio:AudioManager|null=null;
  mode:GameMode='playing';
  stats:RunStats;
  telemetry:RunTelemetry;
  clock=0;
  rewardRoom:RewardRoom|null=null;
  rewardClaimedAt=0;
  private lastHUD=0;
  private lastTrail=0;
  private lastKills=0;
  private pointer:Phaser.GameObjects.Text;
  private chosenClass:ClassId='warrior';
  private capNoticeShown=false;
  private roomElapsed=0;
  private resumeMode:'playing'|'reward'='playing';
  private mapObjects:Phaser.GameObjects.GameObject[]=[];
  private mapPlatforms:Phaser.Physics.Arcade.StaticGroup;
  chapters:ChapterSystem|null=null;
  runMode:RunMode='campaign';
  private rewardKind:'basic'|'core'='basic';
  private pendingCore=false;
  private introCoreGranted=false;
  private recorded=false;
  constructor(){super('Game');}
  init(data:{classId?:unknown;runMode?:unknown}={}):void {
    const selected=data.classId??this.registry.get('playerClass');
    this.chosenClass=isClassId(selected)?selected:'warrior';
    this.registry.set('playerClass',this.chosenClass);
    this.runMode=(data.runMode??this.registry.get('runMode'))==='quick'?'quick':'campaign';
    this.registry.set('runMode',this.runMode);
  }
  create():void {
    this.mode='playing';this.clock=0;this.lastHUD=0;this.lastTrail=0;this.lastKills=0;
    this.capNoticeShown=false;this.rewardRoom=null;this.rewardClaimedAt=0;this.roomElapsed=0;this.resumeMode='playing';
    this.pendingCore=false;this.introCoreGranted=false;this.recorded=false;this.rewardKind='basic';
    this.audio=(this.registry.get('audio') as AudioManager|null)??null;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
    this.stats={seed,classId:this.chosenClass,mode:this.runMode,wave:1,kills:0,upgrades:0,elapsed:0,bestCombo:0};
    this.telemetry=new RunTelemetry(this.chosenClass,this.runMode);
    const random=new Phaser.Math.RandomDataGenerator([seed]);
    const map=new MapGenerator(this,seed).create();
    this.mapObjects=this.children.list.slice();this.mapPlatforms=map.platforms;
    this.physics.world.setBounds(WORLD.inset,WORLD.inset,WORLD.width-WORLD.inset*2,WORLD.height-WORLD.inset*2);
    this.physics.resume();
    this.player=new Player(this,WORLD.width/2,WORLD.height/2,this.chosenClass);
    this.physics.add.collider(this.player,map.platforms);
    this.controls=new InputManager();
    this.effects=new Effects(this);
    this.combat=new CombatSystem(this,this.player,this.effects,map.platforms,this.audio);
    this.upgrades=new UpgradeSystem(random,this.chosenClass);
    this.combat.build=this.upgrades.build;
    this.waves=new WaveSystem(this,random,map.platforms,map.spawnPoints,this.runMode);
    this.chapters=new ChapterSystem(this,map.platforms,seed,this.runMode);
    this.events.on('wave-starting',this.onWaveStarting,this);
    this.waves.start(this.player.x,this.player.y);
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height);
    this.cameras.main.startFollow(this.player,true,.1,.1,0,18);
    this.fitCamera();this.cameras.main.centerOn(this.player.x,this.player.y);
    this.pointer=this.add.text(0,0,'',{fontFamily:'system-ui',fontSize:'12px',color:'#ffd396',backgroundColor:'#0c172be6',padding:{x:9,y:6}}).setOrigin(.5).setDepth(5000);
    this.hud=new HUD({onStart:()=>{},onPause:()=>this.pauseRun(),onResume:()=>this.resumeRun(),onRestart:()=>this.scene.restart({classId:this.player.classId,runMode:this.runMode}),onMenu:()=>this.scene.start('Menu'),onUpgrade:id=>this.selectUpgrade(id),onClaimReward:()=>this.claimReward()},this.audio);
    this.hud.showGame();
    this.hud.toast(`${CLASSES[this.chosenClass].name} · ${CLASSES[this.chosenClass].weapon}`,`${THEME.mission} · 攻击自动索敌`);
    this.combat.onKill=enemy=>this.onKill(enemy);
    this.combat.onHit=()=>{this.stats.bestCombo=Math.max(this.stats.bestCombo,this.player.combo);};
    this.combat.onDamage=()=>{if(this.player.dead)this.die();};
    this.events.on('combat-resolved-hit',(data:ResolvedHit)=>this.telemetry.hit(data));
    this.events.on('combat-resolved-defense',(data:ResolvedDefense)=>this.telemetry.defense(data));
    this.events.on('guard',(x:number,y:number)=>{this.effects.burst(x,y-24,0x94eaff,8,90);this.effects.skill('guard',x,y-24,this.player.aimAngle,0x94eaff,this.player.classId,72);this.audio?.action(this.player.classId,'guard',.45);});
    this.events.on('parry',()=>{this.hud.toast('完美格挡','免疫本次伤害 · 终结充能 +25');this.audio?.sfx('parry',.9);});
    this.events.on('dash',(angle:number=this.player.aimAngle)=>{this.effects.burst(this.player.x,this.player.y,0x6df7e5,10,120);this.effects.skill('dash',this.player.x,this.player.y-24,angle,0x6df7e5,this.player.classId,100);this.audio?.action(this.player.classId,'dash',.72);});
    this.events.on('boss-break',()=>{this.telemetry.bossBreaks++;this.hud.toast('破防！趁现在','首领停止攻击 · 1.8 秒内平伤 +35%');this.audio?.sfx('parry',.8);cameraShake(this,100,.002);});
    this.events.on('boss-phase',()=>{this.hud.toast('首领进入新阶段',this.waves.boss?.phaseHint??'观察前摇与地面预警');this.audio?.sfx('wave',.5);});
    this.events.on('boss-impact',()=>cameraShake(this,90,.002));
    this.events.on('elite-enraged',(enemy:Enemy)=>{this.effects.burst(enemy.x,enemy.y-24,0xffb45e,8,95);});
    this.audio?.playBgm(this.chosenClass,.55);
    window.addEventListener('blur',this.onBlur);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('resize',this.onOrientation);
    this.scale.on(Phaser.Scale.Events.RESIZE,this.fitCamera,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.controls.destroy();this.hud.destroy();
      this.chapters?.destroy();this.chapters=null;
      this.events.off('boss-break');this.events.off('boss-phase');this.events.off('boss-impact');this.events.off('elite-enraged');
      this.rewardRoom?.destroy();this.rewardRoom=null;
      this.events.off('guard');this.events.off('parry');this.events.off('dash');
      this.events.off('wave-starting',this.onWaveStarting,this);
      this.events.off('combat-resolved-hit');this.events.off('combat-resolved-defense');
      window.removeEventListener('blur',this.onBlur);
      document.removeEventListener('visibilitychange',this.onVisibility);
      window.removeEventListener('resize',this.onOrientation);
      this.scale.off(Phaser.Scale.Events.RESIZE,this.fitCamera,this);
    });
    this.refreshHUD();this.onOrientation();
  }
  update(_time:number,rawDelta:number):void {
    if(!this.controls)return;
    if(this.controls.consumePause()) {
      if(this.mode==='playing'||this.mode==='reward')this.pauseRun();else if(this.mode==='paused')this.resumeRun();
    }
    if(this.mode==='dead'){this.effects.tick(Math.min(rawDelta,40));return;}
    if(this.mode==='reward'||this.mode==='victory') {
      const delta=Math.min(rawDelta,40);this.roomElapsed+=delta;
      this.rewardRoom?.tick(this.roomElapsed);this.effects.tick(delta);
      if(this.mode==='reward') {
        this.player.tick(this.clock+this.roomElapsed,delta,this.controls,null,false);
        if(this.rewardRoom?.canClaim(this.player.x,this.player.y))this.claimReward();
      }
      return;
    }
    if(this.mode!=='playing')return;
    const delta=Math.min(rawDelta,40);
    if(this.combat.hitStop.consume(delta))return;
    if(this.physics.world.isPaused)this.physics.resume();
    this.clock+=delta;this.stats.elapsed=this.clock/1000;
    if(this.waves.alive.length>0)this.telemetry.combatSeconds+=delta/1000;
    const target=this.combat.acquireTarget(this.waves.enemies,this.clock);
    this.player.tick(this.clock,delta,this.controls,target);
    if(this.player.didUltimate) {
      this.telemetry.ultimates++;
      this.combat.ultimate(this.waves.enemies,this.clock);
      this.hud.toast(CLASSES[this.player.classId].ultimateName,'终结技释放');
    }
    if(this.player.didAttack) {
      this.combat.attack(this.waves.enemies,this.clock);
    }
    if(this.mode!=='playing')return;
    for(const enemy of this.waves.enemies) {
      if(!enemy.active)continue;
      enemy.tick(this.clock,this.player,(e,s)=>this.combat.fire(e,s,this.clock),(amount,x,y)=>this.combat.hurt(amount,x,this.clock,y,enemy));
      if(this.mode!=='playing')break;
    }
    this.combat.tick(this.clock,this.waves.enemies);this.effects.tick(delta);
    if(this.waves.alive.length>0)this.chapters?.tick(this.clock,this.player,(amount,x,y)=>this.combat.hurt(amount,x,this.clock,y));
    else this.chapters?.clearHazards();
    if(this.mode!=='playing')return;
    if(this.waves.alive.length===0) {
      this.combat.clear();
      // The final guardian leads to celebration, never an unusable build choice.
      if(!this.waves.finalWaveCompleted)this.processUpgrades(true);
      if(this.mode!=='playing')return;
    }
    if(this.clock<this.player.dashUntil&&this.clock-this.lastTrail>25) {this.effects.trail(this.player.x,this.player.y,this.player.facing,this.player.visual);this.lastTrail=this.clock;}
    if(this.waves.tick(this.clock)) {
      if(this.waves.finalWaveCompleted){this.enterRewardRoom();return;}
      this.combat.clear();
      this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+(this.runMode==='quick'?15:10));
      this.waves.start(this.player.x,this.player.y);this.stats.wave=this.waves.wave;
      const boss=this.waves.boss;
      this.hud.toast(boss?`首领降临 · ${boss.bossName}`:`${this.chapters?.info.name} · 第 ${String(this.waves.wave).padStart(2,'0')} / ${this.waves.maxWaves} 波`,boss?'完美格挡与终结可削韧 · 破防后集中输出':this.waves.wave===2?'冲刺穿过危险 · 精准格挡可削减首领韧性':this.waves.wave===4?'终结充满后按 Q / 点击终结':this.chapters?.info.hint??'波次间恢复生命');
      this.audio?.sfx('wave',.55);
    }
    this.updateDirection();
    if(this.clock-this.lastHUD>=80) {this.refreshHUD();this.lastHUD=this.clock;}
  }
  private onWaveStarting(wave:number):void {
    if(this.chapters?.setChapter(wave,this.player)) {
      this.waves.refreshNavigation();this.combat.refreshObstacles(this.mapPlatforms);
    }
    if(isBossWave(wave,this.runMode))this.telemetry.beginBoss(wave);
  }
  pauseRun():void {
    if(this.mode!=='playing'&&this.mode!=='reward')return;
    this.resumeMode=this.mode;
    this.mode='paused';this.physics.pause();this.tweens.pauseAll();this.controls.setEnabled(false);this.hud.showPause();
    this.audio?.setBgmPaused(true);
  }
  resumeRun():void {
    if(this.mode!=='paused')return;
    if(this.isPortrait())return;
    this.mode=this.resumeMode;this.physics.resume();this.tweens.resumeAll();this.controls.setEnabled(true);
    if(this.mode==='reward')this.hud.showRewardRoom(this.stats,false);else this.hud.showGame();
    this.audio?.setBgmPaused(false);
  }
  selectUpgrade(id:string):void {
    if(this.mode!=='upgrade')return;
    const core=this.rewardKind==='core';
    if(!(core?this.upgrades.chooseCore(id,this.player.stats):this.upgrades.choose(id,this.player.stats)))return;
    if(core)this.pendingCore=false;else this.applyUpgradeReward(id);
    this.updateBuildInfo();
    this.audio?.sfx('upgrade',.9);
    this.mode='playing';
    // A single sweep can earn several rewards. Resolve all earned choices in order.
    this.processUpgrades(this.waves.alive.length===0);
    if(this.mode==='playing') {
      this.physics.resume();this.tweens.resumeAll();this.controls.setEnabled(true);this.hud.showGame();
      this.hud.toast(this.upgrades.automatic?'自动加成已开启':'笑点已到账',this.upgrades.automatic?'从第 11 次起随机获得加成 · 战斗不暂停':'强化已生效 · 恢复生命');
    }
    this.refreshHUD();
  }
  private applyUpgradeReward(id:string):void {
    this.stats.upgrades=this.upgrades.count;
    // Track the consumed kill threshold, preserving surplus kills toward the next reward.
    this.lastKills=this.upgrades.nextAt-UPGRADE_RULES.killsPerUpgrade;
    this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+(id==='vitality'?25:12));
    this.player.invulnerableUntil=Math.max(this.player.invulnerableUntil,this.clock+650);
  }
  private onKill(enemy?:Enemy):void {
    if(this.mode!=='playing'&&this.mode!=='upgrade')return;
    if(enemy?.isBoss){this.telemetry.finishBoss();this.pendingCore=this.waves.wave<this.waves.maxWaves;}
    this.stats.kills++;this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+2);
    if(!this.waves.finalWaveCompleted)this.processUpgrades();
    this.refreshHUD();
  }
  get pendingUpgrades():number {
    if(!this.player||this.upgrades.automatic||!this.upgrades.hasAvailable(this.player.stats))return 0;
    const earned=Math.max(0,Math.floor((this.stats.kills-this.upgrades.nextAt)/UPGRADE_RULES.killsPerUpgrade)+1);
    return Math.min(UPGRADE_RULES.manualChoices-this.upgrades.count,earned);
  }
  private processUpgrades(atWaveEnd=false):void {
    if(this.mode!=='playing')return;
    if(this.waves.finalWaveCompleted){this.pendingCore=false;return;}
    if(atWaveEnd&&!this.introCoreGranted&&this.waves.wave===(this.runMode==='quick'?2:3)){this.introCoreGranted=true;this.pendingCore=true;}
    if(atWaveEnd&&this.pendingCore) {
      const choices=this.upgrades.coreChoices(this.player.stats);
      if(choices.length){this.openUpgrade(choices,'core');return;}
      this.pendingCore=false;
    }
    while(this.stats.kills>=this.upgrades.nextAt) {
      if(!this.upgrades.hasAvailable(this.player.stats)){this.skipExhaustedReward();return;}
      if(!this.upgrades.automatic) {
        if(!atWaveEnd)return;
        const choices=this.upgrades.choices(this.player.stats);
        if(!choices.length){this.skipExhaustedReward();continue;}
        this.openUpgrade(choices,'basic');
        return;
      }
      const choice=this.upgrades.chooseRandom(this.player.stats);
      if(!choice){this.skipExhaustedReward();continue;}
      this.applyUpgradeReward(choice.id);this.updateBuildInfo();
      this.hud.announceAutoUpgrade(choice,this.stats.upgrades);
      this.audio?.sfx('upgrade',.55);
    }
  }
  private openUpgrade(choices:ReturnType<UpgradeSystem['choices']>,kind:'basic'|'core'):void {
    this.rewardKind=kind;this.mode='upgrade';this.player.setVelocity(0);this.physics.pause();this.tweens.pauseAll();this.controls.setEnabled(false);
    this.refreshHUD();this.hud.showUpgrade(choices);
  }
  private updateBuildInfo():void {
    this.hud.setBuildInfo(this.upgrades.acquired().map(choice=>`${choice.icon} ${choice.name} ${choice.level}/${choice.maxLevel} · ${choice.description}`));
  }
  /** Every blessing reached its cap: the reward slot is consumed without a new blessing. */
  private skipExhaustedReward():void {
    const owed=Math.floor((this.stats.kills-this.upgrades.nextAt)/UPGRADE_RULES.killsPerUpgrade)+1;
    this.upgrades.skipReward(owed);
    this.lastKills=this.upgrades.nextAt-UPGRADE_RULES.killsPerUpgrade;
    if(!this.capNoticeShown) {
      this.capNoticeShown=true;
      this.hud.toast('快乐加成已达上限','后续不再重复提示 · 继续挑战首领');
    }
    this.refreshHUD();
  }
  private enterRewardRoom():void {
    if(this.mode!=='playing'||this.rewardRoom)return;
    this.pendingCore=false;
    this.saveRecord(true);this.chapters?.destroy();this.chapters=null;
    this.mode='reward';this.combat.clear();this.pointer.setVisible(false);
    this.mapPlatforms.clear(true,true);
    for(const object of this.mapObjects)if(object.scene)object.destroy();
    this.mapObjects=[];
    this.rewardRoom=new RewardRoom(this);
    this.physics.world.setBounds(635,400,650,540);
    this.player.body.reset(this.rewardRoom.spawn.x,this.rewardRoom.spawn.y);
    this.player.health=this.player.stats.maxHealth;
    this.player.guardUntil=0;this.player.dashUntil=0;this.player.ultimateUntil=0;this.player.invulnerableUntil=0;
    this.controls.reset();this.controls.setExplorationMode(true);this.controls.setEnabled(true);
    // Frame the shop sign and parcel above the arrival point on short mobile viewports.
    this.cameras.main.setFollowOffset(0,100);
    this.cameras.main.centerOn(this.player.x,this.player.y-100);
    this.refreshHUD();this.hud.showRewardRoom({...this.stats},false);
    this.audio?.playBgm('menu',.35);this.audio?.sfx('wave',.65);
  }
  claimReward():void {
    if(this.mode!=='reward'||!this.rewardRoom?.claim())return;
    this.rewardClaimedAt=this.clock+this.roomElapsed;
    this.mode='victory';this.player.setVelocity(0);this.player.health=this.player.stats.maxHealth;
    this.physics.pause();this.controls.setEnabled(false);
    this.effects.burst(this.rewardRoom.chest.x,this.rewardRoom.chest.y-55,0xffe5a0,40,320);
    this.audio?.sfx('upgrade',.8);
    this.hud.showRewardRoom({...this.stats},true);
  }
  private die():void {
    this.saveRecord(false);
    this.mode='dead';this.physics.pause();this.controls.setEnabled(false);this.pointer.setVisible(false);
    this.combat.clear();this.effects.burst(this.player.x,this.player.y,0x7effe9,24,230);
    this.audio?.sfx('death',.8);
    this.hud.showDeath({...this.stats});this.refreshHUD();
  }
  private saveRecord(won:boolean):void {
    if(this.recorded)return;this.recorded=true;
    const completedWave=won?this.waves.maxWaves:Math.max(0,this.waves.wave-(this.waves.alive.length>0?1:0));
    this.stats.summary=this.telemetry.snapshot(completedWave,this.stats.elapsed,
      this.upgrades.acquired().map(choice=>`${choice.icon} ${choice.name} ${choice.level}/${choice.maxLevel} · ${choice.description}`));
    recordRun({...this.stats,wave:completedWave},won);
  }
  private refreshHUD():void {
    const waiting=this.waves.inIntermission&&!this.waves.finalWaveCompleted;
    this.hud.setIntermission(waiting?{nextWave:this.waves.wave+1,remaining:Math.max(0,this.waves.nextWaveAt-this.clock),duration:this.waves.intermissionDuration,boss:isBossWave(this.waves.wave+1,this.runMode),chapter:CHAPTERS[chapterForWave(this.waves.wave+1,this.runMode)-1].name}:null);
    const attackRatio=Phaser.Math.Clamp((this.player.nextAttack-this.clock)/this.player.stats.attackCooldown,0,1);
    const dashRatio=Phaser.Math.Clamp((this.player.nextDash-this.clock)/this.player.stats.dashCooldown,0,1);
    const guardRatio=Phaser.Math.Clamp((this.player.nextGuard-this.clock)/this.player.stats.guardCooldown,0,1);
    const definition=CLASSES[this.player.classId];
    const boss=this.waves.boss;
    const target=this.combat.target;
    const state:HUDState={health:this.player.health,maxHealth:this.player.stats.maxHealth,wave:this.waves.wave,kills:this.stats.kills,remaining:this.waves.alive.length,progress:this.stats.kills-this.lastKills,nextUpgrade:this.upgrades.nextAt-this.lastKills,upgrades:this.stats.upgrades,autoUpgrades:this.upgrades.automatic,pendingUpgrades:this.pendingUpgrades,upgradesExhausted:!this.upgrades.hasAvailable(this.player.stats),waveCap:this.waves.maxWaves,boss:boss?{name:boss.bossName,health:boss.health,maxHealth:boss.maxHealth,phase:boss.bossPhase,toughness:boss.toughness,maxToughness:boss.maxToughness,broken:boss.broken}:null,dashRatio,attackRatio,guardRatio,guardActive:this.player.guarding,ultimateCharge:this.player.ultimateCharge,ultimateReady:this.player.ultimateReady,elapsed:this.stats.elapsed,seed:this.stats.seed,combo:this.player.combo,damage:this.player.stats.damage,speed:this.player.stats.speed,critChance:this.player.stats.critChance,attackCooldown:this.player.stats.attackCooldown,dashCooldown:this.player.stats.dashCooldown,status:this.waves.alive.length===0?'本层噪声已清空 · 波末结算':this.pendingUpgrades>0?`已攒 ${this.pendingUpgrades} 次加成 · 清完本波后选择`:'击杀、命中与完美格挡为终结充能',classId:this.player.classId,className:definition.name,weaponName:definition.weapon,ultimateName:definition.ultimateName,attackRange:this.player.stats.attackRange,targetName:target?.active?(target.isBoss?boss?.bossName??'噪声首领':ENEMY_NAMES[target.kind]):'搜索目标'};
    this.hud.update(state);this.controls.updateCooldowns(attackRatio,dashRatio,guardRatio,this.player.ultimateCharge,this.player.guarding,this.player.ultimateReady);
  }
  private updateDirection():void {
    // One pass replaces a per-frame allocation and O(n log n) sort.
    let nearest:Enemy|undefined,distance=Infinity;
    for(const enemy of this.waves.enemies) {
      if(!enemy.active||enemy.state==='Dead')continue;
      const d=(enemy.x-this.player.x)**2+(enemy.y-this.player.y)**2;
      if(d<distance){distance=d;nearest=enemy;}
    }
    if(!nearest){this.pointer.setVisible(false);return;}
    const view=this.cameras.main.worldView;
    if(nearest.x>view.left+35&&nearest.x<view.right-35&&nearest.y>view.top+85&&nearest.y<view.bottom-60){this.pointer.setVisible(false);return;}
    const dx=nearest.x-view.centerX,dy=nearest.y-view.centerY;
    const factor=Math.min((view.width/2-60)/Math.max(1,Math.abs(dx)),(view.height/2-105)/Math.max(1,Math.abs(dy)));
    const arrow=Math.abs(dx)>Math.abs(dy)?(dx>0?'▶':'◀'):(dy>0?'▼':'▲');
    this.pointer.setVisible(true).setPosition(view.centerX+dx*factor,view.centerY+dy*factor).setText(`${arrow} ${Math.round(Math.hypot(nearest.x-this.player.x,nearest.y-this.player.y)/10)}m`);
  }
  private fitCamera():void {this.cameras.main.setZoom(Math.max(this.scale.height/540,this.scale.width/WORLD.width));}
  private isPortrait():boolean {return window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;}
  private onBlur=():void=>{if(this.mode==='playing'||this.mode==='reward')this.pauseRun();};
  private onVisibility=():void=>{if(document.hidden)this.onBlur();};
  private onOrientation=():void=>{if(this.isPortrait())this.onBlur();};
}
