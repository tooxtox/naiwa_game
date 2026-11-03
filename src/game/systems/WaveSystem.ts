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
  private nav:NavigationGrid;
  readonly quickBoss:BossWave;
  constructor(private scene:Phaser.Scene,private random:Phaser.Math.RandomDataGenerator,private platforms:Phaser.Physics.Arcade.StaticGroup,private spawnPoints:{x:number;y:number}[],readonly mode:'campaign'|'quick'='campaign') {
    this.nav=new NavigationGrid(platforms);
    this.quickBoss=CAMPAIGN.bossWaves[this.random.integerInRange(0,CAMPAIGN.bossWaves.length-1)];
  }
  get maxWaves():number {return this.mode==='quick'?10:CAMPAIGN.maxWaves;}
  refreshNavigation():void {
    this.nav=new NavigationGrid(this.platforms);
    for(const enemy of this.enemies)if(enemy.active)enemy.setNavigation(this.nav);
  }
  start(playerX:number,playerY:number):boolean {
    if(this.wave>=this.maxWaves)return false;
    for(const enemy of this.enemies)if(enemy.active)enemy.destroy();
    this.wave++;this.waiting=false;this.nextWaveAt=0;
    this.enemies=[];
    // Chapter cover is placed after the seeded spawn grid. Recheck its real foot
    // boxes once per wave rather than spawning actors into new geometry.
    const boxes:{left:number;right:number;top:number;bottom:number}[]=[];
    for(const object of this.platforms.getChildren()) {
      const b=(object as Phaser.Physics.Arcade.Image).body;
      if(b)boxes.push({left:b.left,right:b.right,top:b.top,bottom:b.bottom});
    }
    const spawnPoints=this.spawnPoints.filter(point=>boxes.every(b=>point.x<b.left-45||point.x>b.right+45||point.y<b.top-38||point.y>b.bottom+38));
    if((CAMPAIGN.bossWaves as readonly number[]).includes(this.wave)) {
      const safe=spawnPoints.filter(p=>Math.hypot(p.x-playerX,(p.y-playerY)/WORLD.verticalScale)>300);
      safe.sort((a,b)=>Math.abs(Math.hypot(a.x-playerX,(a.y-playerY)/WORLD.verticalScale)-440)-Math.abs(Math.hypot(b.x-playerX,(b.y-playerY)/WORLD.verticalScale)-440));
      const point=safe[0]??spawnPoints[0]??{x:WORLD.width/2,y:WORLD.height/2};
      const bossWave=this.mode==='quick'?this.quickBoss:this.wave as BossWave;
      const boss=new Boss(this.scene,point.x,point.y,bossWave,this.nav,this.mode==='quick');
      this.bindCollision(boss);this.enemies.push(boss);return true;
    }
    const safeSpawnPoints=spawnPoints.filter(p=>Math.hypot(p.x-playerX,(p.y-playerY)/WORLD.verticalScale)>285);
    // A sparse layout reduces the encounter count; it never bypasses spawn safety.
    const count=Math.min(4+Math.floor((this.wave-1)*1.5),15,safeSpawnPoints.length);
    const chapter=this.mode==='quick'?Math.min(3,1+Math.floor((this.wave-1)/4)):Math.ceil(this.wave/10);
    const used=new Set<number>();
    for(let i=0;i<count;i++) {
      let kind:EnemyKind=i%3===2?'ranged':'melee';
      if(this.wave>=2&&i===count-1)kind='elite';
      else if(this.wave>=4&&i%5===4)kind='elite';
      if(chapter===2)kind=i%5===4?'elite':i%3===0?'melee':'ranged';
      else if(chapter===3)kind=i%5===4?'elite':i%2===0?'melee':'ranged';
      else if(chapter===4)kind=i%6===5?'elite':i%3===2?'ranged':'melee';
      else if(chapter===5)kind=i%5===4||i%5===2?'elite':i%3===0?'ranged':'melee';
      const angle=i/count*Math.PI*2+this.random.realInRange(-.35,.35);
      const desiredX=playerX+Math.cos(angle)*430, desiredY=playerY+Math.sin(angle)*310;
      const safe=safeSpawnPoints.map((p,index)=>({...p,index})).filter(p=>!used.has(p.index));
      safe.sort((a,b)=>Math.hypot(a.x-desiredX,a.y-desiredY)-Math.hypot(b.x-desiredX,b.y-desiredY));
      const point=safe[this.random.integerInRange(0,Math.max(0,Math.min(1,safe.length-1)))];
      if(!point)break;
      if('index' in point)used.add(point.index as number);
      const enemy=new Enemy(this.scene,point.x,point.y,kind,this.wave,this.nav);
      enemy.configureEncounter(chapter,i);
      this.bindCollision(enemy);
      this.enemies.push(enemy);
    }
    return true;
  }
  private bindCollision(enemy:Enemy):void {
    const collider=this.scene.physics.add.collider(enemy,this.platforms);
    enemy.once(Phaser.GameObjects.Events.DESTROY,()=>{if(collider.world)collider.destroy();});
  }
  get alive():Enemy[] {return this.enemies.filter(e=>e.active&&e.state!=='Dead');}
  get boss():Boss|null {return this.enemies.find(e=>e.active&&e.state!=='Dead'&&e.isBoss) as Boss|undefined??null;}
  get finalWaveCompleted():boolean {return this.wave===this.maxWaves&&this.alive.length===0;}
  tick(now:number):boolean {
    if(this.alive.length>0)return false;
    if(!this.waiting){this.waiting=true;this.nextWaveAt=now+CAMPAIGN.intermission;}
    return now>=this.nextWaveAt;
  }
}
