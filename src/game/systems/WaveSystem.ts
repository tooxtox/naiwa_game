import * as Phaser from 'phaser';
import { WORLD, CAMPAIGN, type EnemyKind, type BossWave } from '../config';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
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
  start(playerX:number,playerY:number):boolean {
    if(this.wave>=CAMPAIGN.maxWaves)return false;
    for(const enemy of this.enemies)if(enemy.active)enemy.destroy();
    this.wave++;this.waiting=false;this.nextWaveAt=0;
    this.enemies=[];
    if((CAMPAIGN.bossWaves as readonly number[]).includes(this.wave)) {
      const safe=this.spawnPoints.filter(p=>Math.hypot(p.x-playerX,(p.y-playerY)/WORLD.verticalScale)>300);
      safe.sort((a,b)=>Math.abs(Math.hypot(a.x-playerX,(a.y-playerY)/WORLD.verticalScale)-440)-Math.abs(Math.hypot(b.x-playerX,(b.y-playerY)/WORLD.verticalScale)-440));
      const point=safe[0]??this.spawnPoints[0]??{x:WORLD.width/2,y:WORLD.height/2};
      const boss=new Boss(this.scene,point.x,point.y,this.wave as BossWave,this.nav);
      this.scene.physics.add.collider(boss,this.platforms);this.enemies.push(boss);return true;
    }
    const count=Math.min(4+Math.floor((this.wave-1)*1.5),15);
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
    return true;
  }
  get alive():Enemy[] {return this.enemies.filter(e=>e.active&&e.state!=='Dead');}
  get boss():Boss|null {return this.enemies.find(e=>e.active&&e.state!=='Dead'&&e.isBoss) as Boss|undefined??null;}
  get finalWaveCompleted():boolean {return this.wave===CAMPAIGN.maxWaves&&this.alive.length===0;}
  tick(now:number):boolean {
    if(this.alive.length>0)return false;
    if(!this.waiting){this.waiting=true;this.nextWaveAt=now+CAMPAIGN.intermission;}
    return now>=this.nextWaveAt;
  }
}
