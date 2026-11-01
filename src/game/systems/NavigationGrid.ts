import * as Phaser from 'phaser';
import { WORLD } from '../config';
interface Point { x: number; y: number; }
interface Block { left: number; right: number; top: number; bottom: number; }

/** Small shared floor grid. Paths are refreshed a few times a second per enemy. */
export class NavigationGrid {
  private readonly cell = 48;
  private readonly cols = Math.ceil(WORLD.width / this.cell);
  private readonly rows = Math.ceil(WORLD.height / this.cell);
  private readonly blocks: Block[] = [];
  private readonly solid: Block[] = [];
  private readonly walkable: boolean[];
  constructor(obstacles: Phaser.Physics.Arcade.StaticGroup) {
    obstacles.children.forEach(object => {
      const b = (object as Phaser.Physics.Arcade.Image).body;
      if (b) {
        this.solid.push({left:b.left,right:b.right,top:b.top,bottom:b.bottom});
        this.blocks.push({left:b.left - 19, right:b.right + 19, top:b.top - 14, bottom:b.bottom + 14});
      }
    });
    this.walkable = Array.from({length:this.cols * this.rows}, (_, i) => this.free(this.center(i)));
  }
  private center(index: number): Point { return {x:(index % this.cols + .5) * this.cell, y:(Math.floor(index / this.cols) + .5) * this.cell}; }
  private free(p: Point): boolean {
    return p.x > WORLD.inset + 12 && p.x < WORLD.width - WORLD.inset - 12 && p.y > WORLD.inset + 12 && p.y < WORLD.height - WORLD.inset - 12 && !this.blocks.some(b=>p.x>b.left&&p.x<b.right&&p.y>b.top&&p.y<b.bottom);
  }
  clearLine(x: number, y: number, tx: number, ty: number): boolean {
    const distance = Math.hypot(tx - x, ty - y), steps = Math.max(1, Math.ceil(distance / 18));
    for (let i = 1; i <= steps; i++) if (!this.free({x:x + (tx-x)*i/steps, y:y + (ty-y)*i/steps})) return false;
    return true;
  }
  /** Attacks use actual cover, not the padded navigation grid or its boundary margin. */
  lineOfSight(x:number,y:number,tx:number,ty:number):boolean {
    const steps=Math.max(1,Math.ceil(Math.hypot(tx-x,ty-y)/8));
    for(let i=1;i<steps;i++) {
      const px=x+(tx-x)*i/steps,py=y+(ty-y)*i/steps;
      if(this.solid.some(b=>px>b.left&&px<b.right&&py>b.top&&py<b.bottom))return false;
    }
    return true;
  }
  private nearest(x: number, y: number): number {
    const cx = Phaser.Math.Clamp(Math.floor(x / this.cell), 0, this.cols-1), cy = Phaser.Math.Clamp(Math.floor(y / this.cell), 0, this.rows-1);
    for (let r=0;r<5;r++) {
      let best=-1,distance=Infinity;
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++) {
        const nx=cx+dx, ny=cy+dy, i=ny*this.cols+nx;
        if(nx>=0&&nx<this.cols&&ny>=0&&ny<this.rows&&this.walkable[i]) {
          const p=this.center(i),d=Math.hypot(p.x-x,p.y-y);
          if(d<distance){distance=d;best=i;}
        }
      }
      if(best>=0)return best;
    }
    return -1;
  }
  route(x:number,y:number,tx:number,ty:number): Point[] {
    if(this.clearLine(x,y,tx,ty))return [{x:tx,y:ty}];
    const start=this.nearest(x,y), target=this.nearest(tx,ty);
    if(start<0||target<0)return [];
    const size=this.cols*this.rows, cost=new Float32Array(size).fill(Infinity), parent=new Int32Array(size).fill(-1), closed=new Uint8Array(size), open=[start];
    const heuristic=(i:number):number=>Math.abs(i%this.cols-target%this.cols)+Math.abs(Math.floor(i/this.cols)-Math.floor(target/this.cols));
    cost[start]=0;
    for(let iterations=0;open.length&&iterations<size;iterations++) {
      let best=0;
      for(let j=1;j<open.length;j++)if(cost[open[j]]+heuristic(open[j])<cost[open[best]]+heuristic(open[best]))best=j;
      const current=open.splice(best,1)[0];
      if(current===target) {
        const path:Point[]=[];
        for(let p=target;p!==start&&p>=0;p=parent[p])path.push(this.center(p));
        path.reverse();
        const last=path[path.length-1]??this.center(start);
        // The final approach may enter the conservative grid margin. Physics still
        // blocks actual cover, while actors remain attackable along the arena rim.
        if(this.lineOfSight(last.x,last.y,tx,ty))path.push({x:tx,y:ty});
        return path;
      }
      closed[current]=1;
      for(const next of [current-1,current+1,current-this.cols,current+this.cols]) {
        if(next<0||next>=size||closed[next]||!this.walkable[next]||Math.abs(next%this.cols-current%this.cols)+Math.abs(Math.floor(next/this.cols)-Math.floor(current/this.cols))!==1)continue;
        const g=cost[current]+1;
        if(g<cost[next]){cost[next]=g;parent[next]=current;if(!open.includes(next))open.push(next);}
      }
    }
    return [];
  }
}
