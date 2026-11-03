import * as Phaser from 'phaser';
import { WORLD } from '../config';
import type { Player } from '../entities/Player';

export const CHAPTERS = [
  {name:'蛙友广场',color:0x9bd8b2,ink:0x477f67,hint:'先走位，再试试精准格挡'},
  {name:'弹幕频道',color:0xb9caef,ink:0x657da2,hint:'宽窄弹幕交替，从弹道缝隙穿过'},
  {name:'缓存迷宫',color:0xb7d5af,ink:0x658254,hint:'掩体可以挡弹，绕过缓存岛再反击'},
  {name:'热搜风暴',color:0xf1cb9b,ink:0xa77648,hint:'热搜落点会提前标记，保持移动'},
  {name:'红温总控',color:0xeeb5b0,ink:0x9a6268,hint:'混合威胁，优先拆除远程火力'},
] as const;

interface FloorHazard {active:boolean;x:number;y:number;started:number;impact:number;ends:number;hit:boolean;}

/** Chapter art and a two-slot warning pool; neither modifies the collision grid. */
export class ChapterSystem {
  chapter=1;
  wave=1;
  readonly hazards:FloorHazard[]=Array.from({length:2},()=>({active:false,x:0,y:0,started:0,impact:0,ends:0,hit:false}));
  private nextHazardAt=0;
  private justChanged=true;
  private readonly decor:Phaser.GameObjects.Graphics;
  private readonly warnings:Phaser.GameObjects.Graphics;
  private readonly sign:Phaser.GameObjects.Text;
  private readonly blocks:{left:number;right:number;top:number;bottom:number}[]=[];
  private readonly seedOffset:number;
  private readonly extraCover:{body:Phaser.Physics.Arcade.Image;visual:Phaser.GameObjects.Graphics}[]=[];

  constructor(private readonly scene:Phaser.Scene,private readonly platforms:Phaser.Physics.Arcade.StaticGroup,seed:string) {
    this.seedOffset=Array.from(seed).reduce((sum,c)=>sum+c.charCodeAt(0),0);
    this.decor=scene.add.graphics().setDepth(-195).setName('naiwa-chapter-decor');
    this.warnings=scene.add.graphics().setDepth(85).setName('naiwa-environment-hazards');
    this.sign=scene.add.text(960,193,'',{fontFamily:'system-ui',fontSize:'12px',color:'#477f67'}).setOrigin(.5).setDepth(-190).setName('naiwa-chapter-hint');
    platforms.children.forEach(object=>{
      const b=(object as Phaser.Physics.Arcade.Image).body;
      if(b)this.blocks.push({left:b.left-40,right:b.right+40,top:b.top-30,bottom:b.bottom+30});
    });
    this.setChapter(1);
  }

  get info():typeof CHAPTERS[number] {return CHAPTERS[this.chapter-1];}
  get warningDuration():number {return 1450;}

  setChapter(wave:number,player?:{x:number;y:number}):boolean {
    const chapter=Math.min(5,Math.max(1,Math.ceil(wave/10)));
    const changed=chapter!==this.chapter;
    const layoutChanged=this.updateCover(chapter,player);
    this.wave=wave;this.chapter=chapter;
    this.justChanged=true;
    for(const h of this.hazards)h.active=false;
    this.warnings.clear();
    const info=this.info;
    const title=this.scene.children.getByName('naiwa-plaza-sign') as Phaser.GameObjects.Text|null;
    title?.setText(info.name).setColor(`#${info.ink.toString(16).padStart(6,'0')}`);
    this.sign.setText(info.hint).setColor(`#${info.ink.toString(16).padStart(6,'0')}`);
    const floor=this.scene.children.getByName('naiwa-cache-plaza') as Phaser.GameObjects.RenderTexture|null;
    floor?.setTint([0xffffff,0xf1f5ff,0xecffe9,0xfff0dc,0xffe6e4][chapter-1]);
    this.drawDecor();
    if(changed)this.scene.events.emit('chapter-change',this.chapter,info);
    return layoutChanged;
  }

  private updateCover(chapter:number,player?:{x:number;y:number}):boolean {
    if(chapter!==3&&this.extraCover.length>0) {
      for(const cover of this.extraCover){this.platforms.remove(cover.body,true,true);cover.visual.destroy();}
      this.extraCover.length=0;return true;
    }
    if(chapter!==3||this.extraCover.length>0)return false;
    for(const [x,y] of [[650,520],[1290,745],[510,930]]) {
      if(player&&Math.hypot(x-player.x,(y-player.y)/WORLD.verticalScale)<160)continue;
      const body=this.platforms.create(x,y+1,'collider') as Phaser.Physics.Arcade.Image;
      body.setDisplaySize(48,26).setVisible(false).setName('naiwa-chapter-cover-body').refreshBody();
      const g=this.scene.add.graphics().setPosition(x,y).setDepth(y+100).setName('naiwa-chapter-cover');
      g.fillStyle(0x4d7057,.2).fillEllipse(5,7,76,27);
      const polygon=(color:number,points:number[][]):void=>{g.fillStyle(color).fillPoints(points.map(([px,py])=>new Phaser.Math.Vector2(px,py)),true);};
      polygon(0xc3bc8a,[[-29,-25],[0,-39],[29,-25],[0,-10]]);
      polygon(0x83a887,[[-29,-25],[0,-10],[0,7],[-29,-8]]);
      polygon(0x668f75,[[0,-10],[29,-25],[29,-8],[0,7]]);
      g.lineStyle(2,0xffefc8,.9).lineBetween(-24,-25,0,-36).lineBetween(0,-36,24,-25);
      g.fillStyle(0xf2e7bc).fillRoundedRect(-9,-29,18,12,2);
      g.lineStyle(2,0x64855c).lineBetween(-5,-24,5,-24).lineBetween(-5,-20,2,-20);
      this.extraCover.push({body,visual:g});
    }
    return this.extraCover.length>0;
  }

  private drawDecor():void {
    const g=this.decor,info=this.info;g.clear();
    g.setData({chapter:this.chapter,theme:info.name});
    for(let i=0;i<24;i++) {
      const x=155+(i*173+this.seedOffset)%1600,y=235+(i*127)%790;
      if(Math.abs(x-960)<200||Math.abs(y-640)<90)continue;
      g.fillStyle(info.color,.22).fillEllipse(x,y,52,28);
      g.lineStyle(2,info.ink,.36);
      if(this.chapter===1) {
        g.strokeCircle(x-6,y-2,4).strokeCircle(x+6,y-2,4);
        g.beginPath().arc(x,y+2,9,.15,Math.PI-.15).strokePath();
      } else if(this.chapter===2) {
        g.strokeRoundedRect(x-19,y-11,38,20,5).lineBetween(x-10,y+9,x-15,y+15);
        for(let j=0;j<3;j++)g.fillStyle(info.ink,.45).fillCircle(x-9+j*9,y-1,2);
      } else if(this.chapter===3) {
        g.strokeRect(x-18,y-9,36,18).lineBetween(x-6,y-8,x-6,y+8).lineBetween(x+6,y-8,x+6,y+8);
        g.lineBetween(x-13,y+13,x+14,y+13);
      } else if(this.chapter===4) {
        g.beginPath().moveTo(x-8,y+9).lineTo(x-4,y-9).lineTo(x+2,y+1).lineTo(x+10,y-6).lineTo(x+7,y+10).closePath().strokePath();
      } else {
        g.strokeRoundedRect(x-16,y-12,32,24,4);
        g.lineBetween(x-9,y-4,x+9,y-4).lineBetween(x-9,y+3,x+9,y+3);
        g.fillStyle(info.ink,.5).fillCircle(x+10,y+8,2);
      }
    }
  }

  tick(now:number,player:Player,hurt:(amount:number,x:number,y:number)=>void):void {
    if(this.justChanged){this.justChanged=false;this.nextHazardAt=now+4200;}
    const g=this.warnings;g.clear();
    if(this.chapter<4||this.wave%10===0||player.dead)return;
    if(now>=this.nextHazardAt) {
      this.nextHazardAt=now+(this.chapter===5?5800:6900);
      this.prepareHazard(this.hazards[0],player.x,player.y,now);
      if(this.chapter===5) {
        const side=Math.floor(now/5800)%2?1:-1;
        this.prepareHazard(this.hazards[1],player.x+side*320,player.y-100,now);
      }
      this.scene.events.emit('environment-warning',this.chapter);
    }
    for(const h of this.hazards) {
      if(!h.active)continue;
      if(now>=h.ends){h.active=false;continue;}
      const warming=now<h.impact,radius=105;
      const progress=Phaser.Math.Clamp((now-h.started)/this.warningDuration,0,1);
      g.fillStyle(0xee996e,warming?.09:.24).fillEllipse(h.x,h.y,radius*2,radius*2*WORLD.verticalScale);
      g.lineStyle(warming?2:4,0xb45d48,.9).strokeEllipse(h.x,h.y,radius*2,radius*2*WORLD.verticalScale);
      g.lineStyle(2,0xffebc6,.9).strokeEllipse(h.x,h.y,radius*2*progress,radius*2*WORLD.verticalScale*progress);
      g.lineStyle(2,0xa85c48,.85).lineBetween(h.x-13,h.y,h.x+13,h.y).lineBetween(h.x,h.y-10,h.x,h.y+10);
      if(!warming&&!h.hit&&Math.hypot(player.x-h.x,(player.y-h.y)/WORLD.verticalScale)<radius+12) {
        h.hit=true;hurt(this.chapter===5?24:18,h.x,h.y);
      }
    }
    g.setData({chapter:this.chapter,activeCount:this.hazards.filter(h=>h.active).length});
  }

  private prepareHazard(h:FloorHazard,x:number,y:number,now:number):void {
    x=Phaser.Math.Clamp(x,WORLD.inset+130,WORLD.width-WORLD.inset-130);
    y=Phaser.Math.Clamp(y,WORLD.inset+105,WORLD.height-WORLD.inset-105);
    if(this.blocks.some(b=>x>b.left&&x<b.right&&y>b.top&&y<b.bottom)) {
      // The centre cross is always clear and is only a fallback for blocked targets.
      x=960;y=Phaser.Math.Clamp(y,280,1000);
    }
    Object.assign(h,{active:true,x,y,started:now,impact:now+this.warningDuration,ends:now+this.warningDuration+300,hit:false});
  }

  destroy():void {
    for(const cover of this.extraCover){if(cover.body.scene)this.platforms.remove(cover.body,true,true);cover.visual.destroy();}
    this.extraCover.length=0;
    this.decor.destroy();this.warnings.destroy();this.sign.destroy();
    for(const h of this.hazards)h.active=false;
  }
}
