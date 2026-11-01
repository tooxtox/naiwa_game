import * as Phaser from 'phaser';
import { generateAssets } from '../graphics/ProceduralAssets';
import { AUDIO_ASSETS } from '../systems/AudioManager';
export class BootScene extends Phaser.Scene {
  constructor(){super('Boot');}
  preload():void {
    const {width,height}=this.scale;
    this.add.rectangle(width/2,height/2,width,height,0x080e21);
    this.add.text(width/2,height/2-47,'余烬正在苏醒',{fontFamily:'system-ui',fontSize:'22px',color:'#ffe3a4'}).setOrigin(.5);
    this.add.text(width/2,height/2+35,'L U M E N F A L L',{fontFamily:'monospace',fontSize:'11px',color:'#89a3b6'}).setOrigin(.5);
    this.add.rectangle(width/2,height/2,240,4,0x223a49);
    const fill=this.add.rectangle(width/2-120,height/2,0,4,0xffd879).setOrigin(0,.5);
    this.load.on(Phaser.Loader.Events.PROGRESS,(progress:number)=>fill.width=240*progress);
    this.load.atlas('mascot-hero','./assets/hero/hero-atlas-v1.png','./assets/hero/hero-atlas-v1.json');
    // Music and effects load with the hero atlas so the first fight is never silent.
    for(const asset of AUDIO_ASSETS)this.load.audio(asset.key,asset.url);
  }
  create():void {
    if(this.textures.exists('mascot-hero'))this.textures.get('mascot-hero').setFilter(Phaser.Textures.FilterMode.LINEAR);
    generateAssets(this);this.scene.start('Menu');
  }
}
