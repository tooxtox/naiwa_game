import * as Phaser from 'phaser';
import { WORLD, CLASSES, UPGRADE_RULES, isClassId, type ClassId, type RunStats, type HUDState } from '../config';
import { Player } from '../entities/Player';
import { InputManager } from '../systems/InputManager';
import { MapGenerator } from '../systems/MapGenerator';
import { CombatSystem } from '../systems/CombatSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { Effects } from '../systems/Effects';
import { AudioManager } from '../systems/AudioManager';
import { HUD } from '../ui/HUD';
export type GameMode='playing'|'paused'|'upgrade'|'dead';
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
  clock=0;
  private lastHUD=0;
  private lastTrail=0;
  private lastKills=0;
  private pointer:Phaser.GameObjects.Text;
  private chosenClass:ClassId='warrior';
  constructor(){super('Game');}
  init(data:{classId?:unknown}={}):void {
    const selected=data.classId??this.registry.get('playerClass');
    this.chosenClass=isClassId(selected)?selected:'warrior';
    this.registry.set('playerClass',this.chosenClass);
  }
  create():void {
    this.mode='playing';this.clock=0;this.lastHUD=0;this.lastTrail=0;this.lastKills=0;
    this.audio=(this.registry.get('audio') as AudioManager|null)??null;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
    this.stats={seed,classId:this.chosenClass,wave:1,kills:0,upgrades:0,elapsed:0,bestCombo:0};
    const random=new Phaser.Math.RandomDataGenerator([seed]);
    const map=new MapGenerator(this,seed).create();
    this.physics.world.setBounds(WORLD.inset,WORLD.inset,WORLD.width-WORLD.inset*2,WORLD.height-WORLD.inset*2);
    this.physics.resume();
    this.player=new Player(this,WORLD.width/2,WORLD.height/2,this.chosenClass);
    this.physics.add.collider(this.player,map.platforms);
    this.controls=new InputManager();
    this.effects=new Effects(this);
    this.combat=new CombatSystem(this,this.player,this.effects,map.platforms,this.audio);
    this.upgrades=new UpgradeSystem(random,this.chosenClass);
    this.waves=new WaveSystem(this,random,map.platforms,map.spawnPoints);
    this.waves.start(this.player.x,this.player.y);
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height);
    this.cameras.main.startFollow(this.player,true,.1,.1,0,18);
    this.fitCamera();this.cameras.main.centerOn(this.player.x,this.player.y);
    this.pointer=this.add.text(0,0,'',{fontFamily:'system-ui',fontSize:'12px',color:'#ffd396',backgroundColor:'#0c172be6',padding:{x:9,y:6}}).setOrigin(.5).setDepth(5000);
    this.hud=new HUD({onStart:()=>{},onPause:()=>this.pauseRun(),onResume:()=>this.resumeRun(),onRestart:()=>this.scene.restart({classId:this.player.classId}),onMenu:()=>this.scene.start('Menu'),onUpgrade:id=>this.selectUpgrade(id)},this.audio);
    this.hud.showGame();
    this.hud.toast(`${CLASSES[this.chosenClass].name} · ${CLASSES[this.chosenClass].weapon}`,'攻击自动锁定最近敌人 · 格挡反击可为终结充能');
    this.combat.onKill=()=>this.onKill();
    this.combat.onDamage=()=>{if(this.player.dead)this.die();};
    this.events.on('guard',(x:number,y:number)=>{this.effects.burst(x,y-24,0x94eaff,8,90);this.audio?.sfx('guard',.4);});
    this.events.on('parry',()=>{this.hud.toast('完美格挡','免疫本次伤害 · 终结充能 +25');this.audio?.sfx('parry',.9);});
    this.events.on('dash',()=>{this.effects.burst(this.player.x,this.player.y,0x6df7e5,10,120);this.audio?.sfx('dash',.55);});
    this.audio?.playBgm(this.chosenClass,.55);
    window.addEventListener('blur',this.onBlur);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('resize',this.onOrientation);
    this.scale.on(Phaser.Scale.Events.RESIZE,this.fitCamera,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      this.controls.destroy();this.hud.destroy();
      this.events.off('guard');this.events.off('parry');this.events.off('dash');
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
      if(this.mode==='playing')this.pauseRun();else if(this.mode==='paused')this.resumeRun();
    }
    if(this.mode==='dead'){this.effects.tick(Math.min(rawDelta,40));return;}
    if(this.mode!=='playing')return;
    const delta=Math.min(rawDelta,40);
    this.clock+=delta;this.stats.elapsed=this.clock/1000;
    const target=this.combat.acquireTarget(this.waves.enemies);
    this.player.tick(this.clock,delta,this.controls,target);
    if(this.player.didUltimate) {
      this.combat.ultimate(this.waves.enemies,this.clock);
      this.hud.toast(CLASSES[this.player.classId].ultimateName,'终结技释放');
    }
    if(this.player.didAttack) {
      this.combat.attack(this.waves.enemies,this.clock);
      this.stats.bestCombo=Math.max(this.stats.bestCombo,this.player.combo);
    }
    if(this.mode!=='playing')return;
    for(const enemy of this.waves.enemies) {
      if(!enemy.active)continue;
      enemy.tick(this.clock,this.player,(e,s)=>this.combat.fire(e,s,this.clock),(amount,x,y)=>this.combat.hurt(amount,x,this.clock,y));
      if(this.mode!=='playing')break;
    }
    this.combat.tick(this.clock,this.waves.enemies);this.effects.tick(delta);
    if(this.mode!=='playing')return;
    if(this.clock<this.player.dashUntil&&this.clock-this.lastTrail>25) {this.effects.trail(this.player.x,this.player.y,this.player.facing,this.player.visual);this.lastTrail=this.clock;}
    if(this.waves.tick(this.clock)) {
      this.combat.clear();
      this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+10);
      this.waves.start(this.player.x,this.player.y);this.stats.wave=this.waves.wave;
      this.hud.toast(`第 ${String(this.waves.wave).padStart(2,'0')} 波 · ${this.waves.wave>=2?'暗潮涌动':'微光遗址'}`,'强敌已抵达 · 波次间恢复 10 生命');
      this.audio?.sfx('wave',.55);
    }
    this.updateDirection();
    if(this.clock-this.lastHUD>=80) {this.refreshHUD();this.lastHUD=this.clock;}
  }
  pauseRun():void {
    if(this.mode!=='playing')return;
    this.mode='paused';this.physics.pause();this.tweens.pauseAll();this.controls.setEnabled(false);this.hud.showPause();
    this.audio?.setBgmPaused(true);
  }
  resumeRun():void {
    if(this.mode!=='paused')return;
    if(this.isPortrait())return;
    this.mode='playing';this.physics.resume();this.tweens.resumeAll();this.controls.setEnabled(true);this.hud.showGame();
    this.audio?.setBgmPaused(false);
  }
  selectUpgrade(id:string):void {
    if(this.mode!=='upgrade')return;
    if(!this.upgrades.choose(id,this.player.stats))return;
    this.applyUpgradeReward(id);
    this.audio?.sfx('upgrade',.9);
    this.mode='playing';
    // A single sweep can earn several rewards. Resolve all earned choices in order.
    this.processUpgrades();
    if(this.mode==='playing') {
      this.physics.resume();this.tweens.resumeAll();this.controls.setEnabled(true);this.hud.showGame();
      this.hud.toast(this.upgrades.automatic?'自动加成已开启':'残光已觉醒',this.upgrades.automatic?'从第 11 次起随机获得加成 · 战斗不暂停':'强化已生效 · 恢复生命');
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
  private onKill():void {
    if(this.mode!=='playing'&&this.mode!=='upgrade')return;
    this.stats.kills++;this.player.health=Math.min(this.player.stats.maxHealth,this.player.health+2);
    this.processUpgrades();
    this.refreshHUD();
  }
  private processUpgrades():void {
    if(this.mode!=='playing')return;
    while(this.stats.kills>=this.upgrades.nextAt) {
      if(!this.upgrades.automatic) {
        const choices=this.upgrades.choices(this.player.stats);
        if(!choices.length){this.skipExhaustedReward();continue;}
        this.mode='upgrade';this.physics.pause();this.tweens.pauseAll();this.controls.setEnabled(false);
        this.refreshHUD();
        this.hud.showUpgrade(choices);
        return;
      }
      const choice=this.upgrades.chooseRandom(this.player.stats);
      if(!choice){this.skipExhaustedReward();continue;}
      this.applyUpgradeReward(choice.id);
      this.hud.announceAutoUpgrade(choice,this.stats.upgrades);
      this.audio?.sfx('upgrade',.55);
    }
  }
  /** Every blessing reached its cap: the reward slot is consumed without a new blessing. */
  private skipExhaustedReward():void {
    this.upgrades.skipReward();
    this.lastKills=this.upgrades.nextAt-UPGRADE_RULES.killsPerUpgrade;
    this.hud.toast('祝福已达上限',`每种增益最多 ${UPGRADE_RULES.maxPerUpgrade} 次 · 继续迎战更强波次`);
    this.refreshHUD();
  }
  private die():void {
    this.mode='dead';this.physics.pause();this.controls.setEnabled(false);this.pointer.setVisible(false);
    this.combat.clear();this.effects.burst(this.player.x,this.player.y,0x7effe9,24,230);
    this.audio?.sfx('death',.8);
    this.hud.showDeath({...this.stats});this.refreshHUD();
  }
  private refreshHUD():void {
    const attackRatio=Phaser.Math.Clamp((this.player.nextAttack-this.clock)/this.player.stats.attackCooldown,0,1);
    const dashRatio=Phaser.Math.Clamp((this.player.nextDash-this.clock)/this.player.stats.dashCooldown,0,1);
    const guardRatio=Phaser.Math.Clamp((this.player.nextGuard-this.clock)/this.player.stats.guardCooldown,0,1);
    const definition=CLASSES[this.player.classId];
    const state:HUDState={health:this.player.health,maxHealth:this.player.stats.maxHealth,wave:this.waves.wave,kills:this.stats.kills,remaining:this.waves.alive.length,progress:this.stats.kills-this.lastKills,nextUpgrade:this.upgrades.nextAt-this.lastKills,upgrades:this.stats.upgrades,autoUpgrades:this.upgrades.automatic,dashRatio,attackRatio,guardRatio,guardActive:this.player.guarding,ultimateCharge:this.player.ultimateCharge,ultimateReady:this.player.ultimateReady,elapsed:this.stats.elapsed,seed:this.stats.seed,combo:this.player.combo,damage:this.player.stats.damage,speed:this.player.stats.speed,critChance:this.player.stats.critChance,attackCooldown:this.player.stats.attackCooldown,dashCooldown:this.player.stats.dashCooldown,status:this.waves.alive.length===0?'区域肃清 · 下一波即将抵达':'自动索敌 · 击杀、命中与完美格挡为终结充能',classId:this.player.classId,className:definition.name,weaponName:definition.weapon,ultimateName:definition.ultimateName,attackRange:this.player.stats.attackRange,targetName:this.combat.target?.active?`${this.combat.target.kind==='elite'?'精英':this.combat.target.kind==='ranged'?'远程敌人':'近战敌人'}`:'搜索目标'};
    this.hud.update(state);this.controls.updateCooldowns(attackRatio,dashRatio,guardRatio,this.player.ultimateCharge,this.player.guarding,this.player.ultimateReady);
  }
  private updateDirection():void {
    const alive=this.waves.alive;
    const nearest=alive.sort((a,b)=>Math.hypot(a.x-this.player.x,a.y-this.player.y)-Math.hypot(b.x-this.player.x,b.y-this.player.y))[0];
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
  private onBlur=():void=>{if(this.mode==='playing')this.pauseRun();};
  private onVisibility=():void=>{if(document.hidden)this.onBlur();};
  private onOrientation=():void=>{if(this.isPortrait())this.onBlur();};
}
