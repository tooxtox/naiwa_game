import * as Phaser from 'phaser';
import { MapGenerator } from '../systems/MapGenerator';
import { HUD } from '../ui/HUD';
import { WORLD, isClassId } from '../config';
import { createHeroVisual, HERO } from '../graphics/HeroPresentation';
import type { AudioManager } from '../systems/AudioManager';
import { getPreferences } from '../systems/Preferences';
export class MenuScene extends Phaser.Scene {
  private hud:HUD;
  private audio:AudioManager|null=null;
  private idleTween?:Phaser.Tweens.Tween;
  private readonly updateMotion=():void=>{if(getPreferences().reducedMotion)this.idleTween?.pause();else this.idleTween?.resume();};
  constructor(){super('Menu');}
  create():void {
    this.audio=(this.registry.get('audio') as AudioManager|null)??null;
    new MapGenerator(this,'naiwa-cache-island').create();
    this.fitCamera();
    const hero=createHeroVisual(this,1100,665).setDepth(765);
    if(this.textures.exists(HERO.texture)) hero.setFrame(0).setDisplaySize(160,160);
    else hero.setScale(1.8);
    this.add.ellipse(1100,663,75,27,0x020b18,.6).setDepth(763);
    this.add.ellipse(1100,665,94,36).setStrokeStyle(1,0xffd977,.25).setDepth(762);
    this.idleTween=this.tweens.add({targets:hero,scaleY:hero.scaleY*1.025,duration:1500,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    this.updateMotion();window.addEventListener('naiwasettingschange',this.updateMotion);
    this.hud=new HUD({onStart:(classId,runMode='campaign')=>{this.registry.set('playerClass',classId);this.registry.set('runMode',runMode);this.scene.start('Game',{classId,runMode});},onPause:()=>{},onResume:()=>{},onRestart:()=>{},onMenu:()=>{},onUpgrade:()=>{},onClaimReward:()=>{}},this.audio);
    const storedClass:unknown=this.registry.get('playerClass');
    this.hud.showMenu(isClassId(storedClass)?storedClass:'warrior',this.registry.get('runMode')==='quick'?'quick':'campaign');
    this.audio?.playBgm('menu',.42);
    this.scale.on(Phaser.Scale.Events.RESIZE,this.fitCamera,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.hud.destroy();window.removeEventListener('naiwasettingschange',this.updateMotion);this.scale.off(Phaser.Scale.Events.RESIZE,this.fitCamera,this);});
  }
  private fitCamera():void {
    this.cameras.main.setBounds(0,0,WORLD.width,WORLD.height).setZoom(Math.max(this.scale.height/540,this.scale.width/WORLD.width));
    this.cameras.main.centerOn(920,580);
  }
}
