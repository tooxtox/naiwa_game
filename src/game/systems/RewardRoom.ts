import * as Phaser from 'phaser';
import { WORLD } from '../config';
import { THEME } from '../theme';

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
    this.floor=scene.add.graphics().setDepth(0).setName('naiwa-reward-shop');
    const g=this.floor;
    g.fillStyle(0x70aa98).fillRect(0,0,WORLD.width,WORLD.height);
    g.fillStyle(0x9fcbb2).fillRoundedRect(563,304,794,720,39);
    g.fillStyle(0x7ca58b).fillRoundedRect(590,342,740,670,30);
    g.fillStyle(0xf3e2b5).fillRoundedRect(590,330,740,670,30);
    g.lineStyle(3,0xfff5d6,.85).strokeRoundedRect(600,340,720,650,24);
    for(let row=0;row<10;row++)for(let col=0;col<11;col++) {
      const x=620+col*63,y=365+row*62;
      g.fillStyle((col+row)%2?0xc6d3ab:0xe3d9ac).fillRoundedRect(x,y,60,59,3);
      g.lineStyle(1,0xfff7dc,.45).strokeRoundedRect(x+2,y+2,56,55,3);
    }
    // A cafe rug, frog paws and a string of bunting replace the old ritual ring.
    g.fillStyle(0x7ba58a,.3).fillEllipse(964,566,442,199);
    g.fillStyle(0xffefbf,.95).fillEllipse(960,560,430,190);
    g.lineStyle(4,0x89b397,.85).strokeEllipse(960,560,420,180);
    g.lineStyle(1,0xc6ab7d,.7).strokeEllipse(960,560,391,159);
    for(const side of [-1,1]) {
      const px=960+side*160;
      g.fillStyle(0x8fb793,.8).fillEllipse(px,568,30,18);
      for(let toe=0;toe<3;toe++)g.fillStyle(0x8fb793,.8).fillCircle(px+(toe-1)*11,553-Math.abs(toe-1)*3,5);
    }
    g.lineStyle(2,0x729980,.9).lineBetween(660,352,1260,352);
    for(let i=0;i<14;i++)g.fillStyle(i%3===0?0xb78ca7:i%3===1?0x8fb797:0xf1cb7b).fillTriangle(670+i*43,353,700+i*43,353,685+i*43,374);
    for(const x of [645,1275])for(const y of [400,870]) {
      g.fillStyle(0x527e69,.25).fillEllipse(x+7,y+12,70,27);
      g.fillStyle(0xe6c891).fillRoundedRect(x-22,y-43,44,49,7);
      g.fillStyle(0xffedc5).fillRoundedRect(x-20,y-43,30,47,6);
      g.fillStyle(0x92b194).fillRect(x-10,y-58,20,17);
      g.fillStyle(0xffe9b6).fillRoundedRect(x-15,y-69,30,14,4);
      g.fillStyle(0xfff7d9,.9).fillEllipse(x,y-70,27,10);
      for(const side of [-1,1]) {
        g.fillStyle(0xb7d19c).fillCircle(x+side*8,y-23,7);
        g.fillStyle(0x3f6850).fillCircle(x+side*8+1,y-23,3);
      }
      g.lineStyle(2,0x668158).beginPath().arc(x,y-18,8,.1,Math.PI-.1).strokePath();
    }
    // Cream pawprints lead from arrival to the parcel, with the same walkable route.
    for(let i=0;i<6;i++) {
      const px=960+(i%2?8:-8),py=700-i*23;
      g.fillStyle(0x8cac86,.4+i*.05).fillEllipse(px,py,10,6).fillCircle(px-4,py-5,2).fillCircle(px,py-6,2).fillCircle(px+4,py-5,2);
    }
    this.treasure=scene.add.graphics().setDepth(this.chest.y+120).setName('naiwa-happy-parcel');
    this.motes=scene.add.graphics().setDepth(this.chest.y+140);
    this.label=scene.add.text(960,397,THEME.rewardRoom,{fontFamily:'system-ui',fontSize:'26px',color:'#507b61',fontStyle:'bold',stroke:'#fff2d0',strokeThickness:3}).setOrigin(.5).setDepth(100).setName('naiwa-reward-sign');
    this.caption=scene.add.text(960,600,'蛙友庆功屋 · 跟着蛙掌印领走快乐补给',{fontFamily:'system-ui',fontSize:'13px',color:'#5a8168'}).setOrigin(.5).setDepth(100).setName('naiwa-reward-caption');
    this.tick(0);
  }

  canClaim(x:number,y:number):boolean {
    return !this.claimed&&Math.hypot(x-this.chest.x,(y-this.chest.y)/WORLD.verticalScale)<82;
  }
  claim():boolean {
    if(this.claimed)return false;
    this.claimed=true;this.caption.setText('笑声已找回，奶蛙和蛙友们都开心啦！');
    return true;
  }
  tick(now:number):void {
    const {x,y}=this.chest,g=this.treasure;g.clear().setPosition(x,y);
    g.fillStyle(0x50725a,.3).fillEllipse(0,5,128,41);
    g.fillStyle(0xfff0bc,.12+Math.sin(now*.002)*.035).fillEllipse(0,-11,170,92);
    // A milk-yellow care parcel with mint ribbon and a green-eyed smile sticker.
    g.fillStyle(0xc2a777).fillRect(-48,-35,96,41);
    g.fillStyle(0xf0d69a).fillRect(-45,-32,90,34);
    g.fillStyle(0xffe8b4).fillRect(-43,-30,78,28);
    g.lineStyle(3,0xfff2cc).strokeRect(-48,-35,96,41);
    g.fillStyle(0x8db49a).fillRect(-32,-35,7,41).fillRect(26,-35,7,41);
    const lidY=this.claimed?-77:-56;
    g.fillStyle(this.claimed?0xe4c586:0xe8ce94).fillRoundedRect(-50,lidY,100,26,5);
    g.lineStyle(3,0xfff3d0).strokeRoundedRect(-50,lidY,100,26,5);
    g.fillStyle(0x8fb79a).fillRect(-32,lidY,7,26).fillRect(26,lidY,7,26);
    // The bow forms two playful leaves; opened parcels release soft confetti light.
    g.lineStyle(3,0x83ad8b).strokeEllipse(-12,lidY-3,27,15).strokeEllipse(12,lidY-3,27,15);
    g.fillStyle(0xaccb9d).fillCircle(0,lidY-3,5);
    if(this.claimed) {
      g.fillStyle(0xfff3c8,.95).fillEllipse(0,-28,70,22);
      g.fillStyle(0xfff6d4,.18).fillTriangle(-39,-25,-75,-150,75,-150).fillTriangle(-39,-25,75,-150,39,-25);
    } else {
      g.fillStyle(0xfff3ce).fillRoundedRect(-18,-34,36,29,5);
      for(const side of [-1,1]) {
        g.fillStyle(0x91b574).fillCircle(side*8,-25,6);
        g.fillStyle(0x3e6045).fillCircle(side*8+1,-25,3);
      }
      g.lineStyle(2,0x658254).beginPath().arc(0,-20,7,.1,Math.PI-.1).strokePath();
    }
    this.motes.clear();
    for(let i=0;i<14;i++) {
      const age=(now*.0004+i/14)%1,a=i*2.399;
      const px=x+Math.cos(a)*70*(.4+age),py=y-40-age*100+Math.sin(a)*15;
      this.motes.fillStyle(i%3===0?0xae7fa0:i%3===1?0xffedb1:0x88b295,(1-age)*.8).fillRect(px,py,3,3+Math.sin(i)*1.5);
    }
  }
  destroy():void {
    this.floor.destroy();this.treasure.destroy();this.motes.destroy();this.label.destroy();this.caption.destroy();
  }
}
