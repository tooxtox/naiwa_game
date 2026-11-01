import * as Phaser from 'phaser';
interface Mote {image:Phaser.GameObjects.Image;vx:number;vy:number;life:number;maxLife:number;gravity:number;opacity:number;}
export class Effects {
  private pool:Mote[]=[];
  private labels:Phaser.GameObjects.Text[]=[];
  private labelIndex=0;
  constructor(private scene:Phaser.Scene) {
    for(let i=0;i<100;i++) this.pool.push({image:scene.add.image(-100,-100,'spark').setDepth(12).setVisible(false),vx:0,vy:0,life:0,maxLife:1,gravity:0,opacity:.8});
    for(let i=0;i<12;i++) this.labels.push(scene.add.text(0,0,'',{fontFamily:'monospace',fontSize:'19px',fontStyle:'bold',color:'#f4fff6',stroke:'#091627',strokeThickness:4}).setOrigin(.5).setDepth(15).setVisible(false));
  }
  burst(x:number,y:number,color:number,count=10,power=140):void {
    let spawned=0;
    for(const mote of this.pool) {
      if(mote.life>0) continue;
      const angle=Math.random()*Math.PI*2;
      const speed=(.3+Math.random()*.7)*power;
      mote.vx=Math.cos(angle)*speed;mote.vy=Math.sin(angle)*speed-40;
      mote.life=mote.maxLife=300+Math.random()*330;mote.gravity=220;
      mote.opacity=.8;
      mote.image.setTexture('spark').setOrigin(.5).setDepth(y+165).setFlipX(false).setPosition(x,y).setVisible(true).setAlpha(1).setTint(color).setScale(.5+Math.random()*.7);
      if(++spawned>=count) break;
    }
  }
  trail(x:number,y:number,facing:number,visual?:Phaser.GameObjects.Sprite):void {
    const mote=this.pool.find(m=>m.life<=0);if(!mote)return;
    mote.life=mote.maxLife=190;mote.vx=0;mote.vy=0;mote.gravity=0;
    mote.opacity=.32;
    if(visual) {
      mote.image.setTexture(visual.texture.key,visual.frame.name).setOrigin(visual.originX,visual.originY)
        .setDisplaySize(visual.displayWidth,visual.displayHeight).setFlipX(visual.flipX).setPosition(visual.x,visual.y);
    } else {
      mote.image.setTexture('player').setOrigin(.5,1).setScale(1).setFlipX(facing<0).setPosition(x,y);
    }
    mote.image.setDepth(y+99).setVisible(true).setTint(0xffdc82).setAlpha(.32);
  }
  number(x:number,y:number,value:number,critical=false):void {
    const label=this.labels[this.labelIndex++%this.labels.length];
    this.scene.tweens.killTweensOf(label);
    label.setPosition(x,y-32).setDepth(y+250).setText(critical?`${value}!`:`${value}`).setColor(critical?'#ffd29b':'#edfff9').setAlpha(1).setScale(critical?1.25:1).setVisible(true);
    this.scene.tweens.add({targets:label,y:y-80,alpha:0,duration:600,onComplete:()=>label.setVisible(false)});
  }
  tick(delta:number):void {
    const dt=delta/1000;
    for(const mote of this.pool) if(mote.life>0) {
      mote.life-=delta;mote.vy+=mote.gravity*dt;
      mote.image.x+=mote.vx*dt;mote.image.y+=mote.vy*dt;
      mote.image.setAlpha(Math.max(0,mote.life/mote.maxLife)*mote.opacity);
      if(mote.life<=0)mote.image.setVisible(false);
    }
  }
}
