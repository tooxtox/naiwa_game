import * as Phaser from 'phaser';
import { WORLD, type EnemyKind } from '../config';
import { Enemy } from '../entities/Enemy';
import { NavigationGrid } from './NavigationGrid';
export class WaveSystem {
  wave=0;
  enemies:Enemy[]=[];
  nextWaveAt=0;
  private waiting=false;
  private readonly nav:NavigationGrid;
  constructor(private scene:Phaser.Scene,private random:Phaser.Math.RandomDataGenerator,private platforms:Phaser.Physics.Arcade.StaticGroup,private spawnPoints:{x:number;y:number}[]) {
    this.nav=new NavigationGrid(platforms);
  }
  start(playerX:number,playerY:number):void {
    this.wave++;this.waiting=false;this.nextWaveAt=0;
    const count=Math.min(4+Math.floor((this.wave-1)*1.5),15);
    this.enemies=[];
    const used=new Set<number>();
    for(let i=0;i<count;i++) {
      let kind:EnemyKind=i%3===2?'ranged':'melee';
      if(this.wave>=2&&i===count-1)kind='elite';
      else if(this.wave>=4&&i%5===4)kind='elite';
      const angle=i/count*Math.PI*2+this.random.realInRange(-.35,.35);
      const desiredX=playerX+Math.cos(angle)*430, desiredY=playerY+Math.sin(angle)*310;
      const safe=this.spawnPoints.map((p,index)=>({...p,index})).filter(p=>!used.has(p.index)&&Math.hypot(p.x-playerX,(p.y-playerY)/WORLD.verticalScale)>285);
      safe.sort((a,b)=>Math.hypot(a.x-desiredX,a.y-desiredY)-Math.hypot(b.x-desiredX,b.y-desiredY));
      const point=safe[this.random.integerInRange(0,Math.min(1,safe.length-1))]??this.spawnPoints[i%this.spawnPoints.length];
      if('index' in point)used.add(point.index as number);
      const enemy=new Enemy(this.scene,point.x,point.y,kind,this.wave,this.nav);
      this.scene.physics.add.collider(enemy,this.platforms);
      this.enemies.push(enemy);
    }
  }
  get alive():Enemy[] {return this.enemies.filter(e=>e.active&&e.state!=='Dead');}
  tick(now:number):boolean {
    if(this.alive.length>0)return false;
    if(!this.waiting){this.waiting=true;this.nextWaveAt=now+2800;}
    return now>=this.nextWaveAt;
  }
}
