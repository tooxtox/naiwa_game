import * as Phaser from 'phaser';
import { WORLD } from '../config';

/** A safe, walkable epilogue room; the chest can be opened exactly once. */
export class RewardRoom {
  readonly chest={x:960,y:530};
  readonly spawn={x:960,y:735};
  claimed=false;
  private readonly floor:Phaser.GameObjects.Graphics;
  private readonly treasure:Phaser.GameObjects.Graphics;
  private readonly label:Phaser.GameObjects.Text;
  private readonly caption:Phaser.GameObjects.Text;
  private readonly motes:Phaser.GameObjects.Graphics;

  constructor(scene:Phaser.Scene) {
    this.floor=scene.add.graphics().setDepth(0);
    const g=this.floor;
    g.fillStyle(0x07131e).fillRect(0,0,WORLD.width,WORLD.height);
    g.fillStyle(0x142d39).fillRoundedRect(590,330,740,670,30);
    g.lineStyle(3,0x75c6b0,.45).strokeRoundedRect(600,340,720,650,24);
    for(let row=0;row<10;row++)for(let col=0;col<11;col++) {
      const x=620+col*63,y=365+row*62;
      g.fillStyle((col+row)%2?0x193a43:0x17323e).fillRect(x,y,60,59);
      g.lineStyle(1,0x98bba0,.08).strokeRect(x+2,y+2,56,55);
    }
    g.fillStyle(0x071921,.7).fillEllipse(960,560,430,190);
    g.lineStyle(2,0xd9c875,.55).strokeEllipse(960,560,420,180);
    g.lineStyle(1,0x88e1ca,.4).strokeEllipse(960,560,365,154);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6,x=960+Math.cos(a)*185,y=560+Math.sin(a)*78;
      g.fillStyle(0xf5d58a,.7).fillCircle(x,y,3);
    }
    for(const x of [645,1275])for(const y of [400,870]) {
      g.fillStyle(0x07151e,.65).fillEllipse(x+7,y+12,70,27);
      g.fillStyle(0x2c4851).fillRect(x-20,y-46,40,50);
      g.fillStyle(0x52706a).fillEllipse(x,y-46,44,18);
      g.fillStyle(0xf6d185).fillTriangle(x-9,y-55,x,y-91,x+9,y-55);
      g.fillStyle(0xffefbb).fillCircle(x,y-61,5);
    }
    // The gold trail leads from the arrival point to the treasure.
    for(let i=0;i<6;i++)g.fillStyle(0xf1d18b,.18+i*.04).fillCircle(960,700-i*23,3);
    this.treasure=scene.add.graphics().setDepth(this.chest.y+120);
    this.motes=scene.add.graphics().setDepth(this.chest.y+140);
    this.label=scene.add.text(960,397,'黎 明 宝 库',{fontFamily:'system-ui',fontSize:'26px',color:'#f5dfa1',fontStyle:'bold'}).setOrigin(.5).setDepth(100);
    this.caption=scene.add.text(960,600,'沿金色光迹靠近宝箱 · 或点击领取奖励',{fontFamily:'system-ui',fontSize:'13px',color:'#aacbc8'}).setOrigin(.5).setDepth(100);
    this.tick(0);
  }

  canClaim(x:number,y:number):boolean {
    return !this.claimed&&Math.hypot(x-this.chest.x,(y-this.chest.y)/WORLD.verticalScale)<82;
  }
  claim():boolean {
    if(this.claimed)return false;
    this.claimed=true;this.caption.setText('百轮逐光者 · 余烬迎来了黎明');
    return true;
  }
  tick(now:number):void {
    const {x,y}=this.chest,g=this.treasure;g.clear().setPosition(x,y);
    g.fillStyle(0x020b13,.65).fillEllipse(0,5,128,41);
    g.fillStyle(0xf3d281,.08+Math.sin(now*.002)*.025).fillEllipse(0,-11,170,92);
    g.fillStyle(0x69482d).fillRect(-48,-35,96,41);
    g.fillStyle(0x9b6a38).fillRect(-45,-32,90,34);
    g.lineStyle(3,0xf1cf7d).strokeRect(-48,-35,96,41);
    g.fillStyle(0xe1b55d).fillRect(-32,-35,6,41).fillRect(26,-35,6,41);
    const lidY=this.claimed?-77:-56;
    g.fillStyle(this.claimed?0xc89850:0x7f592f).fillRoundedRect(-50,lidY,100,26,5);
    g.lineStyle(3,0xffdda0).strokeRoundedRect(-50,lidY,100,26,5);
    if(this.claimed) {
      g.fillStyle(0xffe9a9,.95).fillEllipse(0,-28,70,22);
      g.fillStyle(0xfff2bd,.15).fillTriangle(-39,-25,-75,-150,75,-150).fillTriangle(-39,-25,75,-150,39,-25);
    } else {
      g.fillStyle(0xffdf90).fillRoundedRect(-10,-39,20,23,3);
      g.fillStyle(0x453a2b).fillCircle(0,-30,3).fillRect(-1,-29,2,7);
    }
    this.motes.clear();
    for(let i=0;i<14;i++) {
      const age=(now*.0004+i/14)%1,a=i*2.399;
      const px=x+Math.cos(a)*70*(.4+age),py=y-40-age*100+Math.sin(a)*15;
      this.motes.fillStyle(0xffe8a6,(1-age)*.65).fillCircle(px,py,1+Math.sin(i)*.5);
    }
  }
  destroy():void {
    this.floor.destroy();this.treasure.destroy();this.motes.destroy();this.label.destroy();this.caption.destroy();
  }
}
