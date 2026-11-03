import * as Phaser from 'phaser';
import { WORLD } from '../config';
import { THEME } from '../theme';

export interface MapResult {
  /** Invisible, low foot boxes. Visual height never changes collision height. */
  platforms: Phaser.Physics.Arcade.StaticGroup;
  spawnPoints: { x: number; y: number }[];
  layoutVariant:number;
}

type PropKind = 'pillar' | 'crate' | 'wall' | 'shrine';
interface Obstacle { x: number; y: number; width: number; height: number; }

/** Screen-space ground plane: the artwork supplies the 2.5D height, physics remains two-dimensional. */
export class MapGenerator {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly obstacles: Obstacle[] = [];
  readonly layoutVariant:number;

  constructor(private readonly scene: Phaser.Scene, public readonly seed: string) {
    this.rng = new Phaser.Math.RandomDataGenerator([seed]);
    this.layoutVariant=Array.from(seed).reduce((sum,c)=>sum+c.charCodeAt(0),0)%3;
  }

  create(): MapResult {
    this.drawGround();
    const platforms = this.scene.physics.add.staticGroup();
    // Separated islands of cover leave a continuous east/west and north/south route.
    // The central 300 × 250 arrival area is always empty.
    const locations: [number, number, PropKind][] = [
      [325, 290, 'pillar'], [620, 310, 'wall'], [1250, 290, 'wall'], [1590, 310, 'pillar'],
      [465, 450, 'crate'], [755, 430, 'shrine'], [1190, 430, 'pillar'], [1480, 470, 'crate'],
      [285, 730, 'wall'], [560, 820, 'pillar'], [780, 865, 'crate'], [1170, 855, 'crate'],
      [1420, 800, 'pillar'], [1655, 745, 'wall'],
      [335, 1020, 'pillar'], [700, 1060, 'wall'], [1230, 1040, 'wall'], [1580, 1030, 'shrine'],
    ];
    locations.forEach(([baseX, baseY, kind], index) => {
      // Three arrangements stay within the same separated cover islands. The
      // centre cross and arrival area remain empty in every seeded variant.
      const shift=this.layoutVariant*19;
      const x = baseX+(index%2?shift:-shift)+this.rng.between(-26,26);
      const y = baseY+(index%3===0?-shift*.5:shift*.5)+this.rng.between(-22,22);
      this.addObstacle(platforms, x, y, kind, index);
    });
    this.addBotany();
    this.scene.add.text(960,158,THEME.arena,{fontFamily:'system-ui',fontSize:'20px',fontStyle:'bold',color:'#467968'}).setOrigin(.5).setDepth(-190).setName('naiwa-plaza-sign');
    this.scene.add.text(1690,1090,'笑点回收  ↗  缓存中…',{fontFamily:'system-ui',fontSize:'12px',color:'#5b826a'}).setOrigin(.5).setDepth(-190).setName('naiwa-cache-sign');
    const spawnPoints: { x: number; y: number }[] = [];
    // Spawn at reachable floor positions, never inside an object's visual footprint.
    for (let y = 220; y <= WORLD.height - 180; y += 180) {
      for (let x = 210; x <= WORLD.width - 180; x += 210) {
        const candidate = { x: x + this.rng.between(-26, 26), y: y + this.rng.between(-24, 24) };
        if (this.obstacles.every(o => Math.abs(o.x - candidate.x) > o.width / 2 + 72 || Math.abs(o.y - candidate.y) > o.height / 2 + 90)) {
          spawnPoints.push(candidate);
        }
      }
    }
    return { platforms, spawnPoints, layoutVariant:this.layoutVariant };
  }

  private polygon(g: Phaser.GameObjects.Graphics, color: number, coords: number[][], alpha = 1): void {
    g.fillStyle(color, alpha).fillPoints(coords.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  }

  private drawGround(): void {
    const g = this.scene.add.graphics().setDepth(-200);
    const width = WORLD.width, height = WORLD.height;
    g.fillStyle(0x4b837b).fillRect(0, 0, width, height);
    // A mint milk canal frames the cache island; all decoration stays outside collision.
    g.fillStyle(0x6cb7ac).fillRoundedRect(30, 35, width - 60, height - 68, 52);
    g.lineStyle(2, 0xd2ead5, .4).strokeRoundedRect(40, 45, width - 80, height - 88, 46);
    g.lineStyle(2, 0xe9efd3, .18).strokeRoundedRect(59, 65, width - 118, height - 128, 32);
    for (let i = 0; i < 140; i++) {
      const x = this.rng.between(25, width - 25), y = this.rng.between(30, height - 25);
      if (x > 90 && x < width - 90 && y > 95 && y < height - 90) continue;
      g.lineStyle(1, 0xebf6dd, this.rng.realInRange(.12, .35)).lineBetween(x, y, x + this.rng.between(5, 22), y);
    }
    // Extruded southern and eastern edges distinguish the floor from a flat orthogonal map.
    g.fillStyle(0x477a6d).fillRoundedRect(92, 108, width - 176, height - 160, 18);
    g.fillStyle(0x6b9781).fillRoundedRect(84, 93, width - 168, height - 186, 14);
    g.fillStyle(0xddd5ac).fillRoundedRect(84, 88, width - 168, height - 194, 12);
    g.fillStyle(0x82a38d).fillRoundedRect(100, 105, width - 200, height - 224, 5);
    g.lineStyle(2, 0xf9efd1, .7).strokeRoundedRect(94, 99, width - 188, height - 212, 6);

    // Diamond paving supplies perspective without changing the actual ground coordinate system.
    const tw = 112, th = 60;
    const tileColors = [0xa0b9a0, 0xabc3aa, 0xbec5a6, 0x94b7a0, 0xc8c9a8, 0xa8bd9d];
    for (let row = 0; row < 34; row++) {
      const y = 130 + row * th / 2;
      for (let col = 0; col < 16; col++) {
        const x = 126 + col * tw + (row % 2) * tw / 2;
        if (x + tw / 2 > width - 102 || y + th / 2 > height - 122) continue;
        if (x - tw / 2 < 101 || y - th / 2 < 106) continue;
        const points = [[x, y - th / 2 + 1], [x + tw / 2 - 1, y], [x, y + th / 2 - 1], [x - tw / 2 + 1, y]];
        this.polygon(g, this.rng.pick(tileColors), points);
        g.lineStyle(1, 0xe8e7c8, .55).lineBetween(x - tw / 2 + 2, y, x, y - th / 2 + 2).lineBetween(x, y - th / 2 + 2, x + tw / 2 - 2, y);
        if (this.rng.frac() < .12) {
          g.lineStyle(1, 0x719b8c, .7).lineBetween(x - 9, y - 15, x + 7, y - 4).lineBetween(x + 7, y - 4, x + 3, y + 8);
        }
      }
    }
    // Cream data lanes connect the plaza like a cheerful offline message board.
    g.fillStyle(0xd8d6b6, .52).fillRect(112, 604, width - 224, 72).fillRect(925, 118, 70, height - 254);
    g.lineStyle(1, 0x557e74, .35).lineBetween(112, 608, width - 112, 608).lineBetween(112, 672, width - 112, 672);
    g.lineStyle(1, 0x557e74, .35).lineBetween(929, 118, 929, height - 136).lineBetween(991, 118, 991, height - 136);
    for (let x = 170; x < width - 140; x += 120) {
      g.lineStyle(1, 0x367c72, .45).lineBetween(x, 620, x + 10, 626).lineBetween(x + 10, 626, x, 632);
      g.lineStyle(1, 0x367c72, .35).lineBetween(x, 652, x + 10, 658).lineBetween(x + 10, 658, x, 664);
    }
    // Small border stones, with their upper bevel and exposed side face.
    for (let x = 110; x < width - 120; x += 70) {
      g.fillStyle(0x6d9b87).fillRect(x, 109, 61, 17).fillRect(x, height - 143, 61, 20);
      g.fillStyle(0xf2e6bc).fillRect(x, 107, 61, 7).fillRect(x, height - 148, 61, 8);
      g.lineStyle(1, 0xfff7de, .7).lineBetween(x + 2, 108, x + 58, 108).lineBetween(x + 2, height - 147, x + 58, height - 147);
    }
    for (let y = 145; y < height - 170; y += 63) {
      g.fillStyle(0xe0d6ad).fillRect(100, y, 18, 55).fillRect(width - 119, y, 18, 55);
      g.fillStyle(0x90b49a).fillRect(103, y + 9, 13, 43).fillRect(width - 116, y + 9, 13, 43);
    }
    for (let i = 0; i < 95; i++) {
      const x = this.rng.between(130, width - 130), y = this.rng.between(150, height - 170);
      if (Phaser.Math.Distance.Between(x, y, width / 2, height / 2) < 150) continue;
      g.fillStyle(0xfaf3d6, .16).fillEllipse(x, y, this.rng.between(9, 26), 4);
      g.fillStyle(0x608a7d, .38).fillRect(x + 4, y + 4, 3, 2);
    }
    // Deterministic canal leaves and milk bubbles do not consume map randomness.
    for(let i=0;i<20;i++) {
      const px=52+(i*173)%(width-104),py=i%2?height-72:69;
      g.fillStyle(0x4f9477,.8).fillEllipse(px,py,35,17);
      this.polygon(g,0x6cb7ac,[[px,py],[px+18,py-9],[px+8,py+1]]);
      g.lineStyle(1,0xc5e1bd,.7).lineBetween(px-10,py,px+8,py);
      g.fillStyle(0xfff4d6,.75).fillCircle(px+26,py-8,3+(i%3));
    }
    this.drawSigil(g, width / 2, height / 2);
    // Bake hundreds of paving polygons into one draw surface; all geometry is static.
    const floor = this.scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(-200).setName('naiwa-cache-plaza');
    floor.draw(g);
    // Phaser 4 buffers draw commands; flush while the source Graphics is still alive.
    floor.render();
    g.destroy();
  }

  private drawSigil(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    // A flattened mascot sticker is the meeting point, not a magical summoning seal.
    g.fillStyle(0x648e7c,.3).fillEllipse(x+5,y+9,378,223);
    g.fillStyle(0xf5e7b8,.88).fillEllipse(x,y,368,211);
    g.lineStyle(5,0x70aa8b,.9).strokeEllipse(x,y,357,200);
    g.lineStyle(1,0xfff7d9,.9).strokeEllipse(x,y,341,186);
    g.fillStyle(0xe9c46a,.8).fillEllipse(x,y+8,163,94);
    g.fillStyle(0xf7d976).fillEllipse(x,y+2,158,91);
    for(const side of [-1,1]) {
      const ex=x+side*49;
      g.fillStyle(0xf7d976).fillEllipse(ex,y-30,60,45);
      g.fillStyle(0x80ad65).fillEllipse(ex,y-31,37,30);
      g.fillStyle(0x163c30).fillEllipse(ex+side*3,y-31,19,23);
      g.fillStyle(0xfff6da).fillEllipse(ex+side*3-4,y-36,7,6);
      g.fillStyle(0xd98f84,.5).fillEllipse(x+side*57,y+18,24,9);
    }
    g.lineStyle(4,0x785b3e,.9).beginPath().arc(x,y+4,22,.16,Math.PI-.16).strokePath();
    for(const side of [-1,1]) {
      const px=x+side*128,py=y+23;
      g.fillStyle(0x82af8b,.7).fillEllipse(px,py+7,27,17);
      for(let toe=0;toe<3;toe++)g.fillStyle(0x82af8b,.7).fillEllipse(px+(toe-1)*11,py-5-Math.abs(toe-1)*3,10,9);
    }
    // Signal arcs and a tiny cache bar read as playful internet infrastructure.
    for(let i=0;i<3;i++)g.lineStyle(3,0x76a68c,.7).beginPath().arc(x,y-49,15+i*11,Math.PI*1.18,Math.PI*1.82).strokePath();
    for(let i=0;i<9;i++)g.fillStyle(i<6?0x82ae8b:0xd4cda7,.75).fillRoundedRect(x-49+i*12,y+73,8,5,2);
  }

  private addObstacle(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, kind: PropKind, index: number): void {
    const g = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100).setName(`naiwa-${kind}-${index}`);
    let width = 44, height = 30;
    g.fillStyle(0x355c50,.24).fillEllipse(12,9,kind==='wall'?130:90,33);
    if(kind==='pillar'||kind==='shrine') {
      width=46;height=28;
      // The same plinth and footprint now support milk lamps and snack kiosks.
      this.polygon(g,0x8aac8d,[[-34,-10],[0,-27],[34,-10],[34,4],[0,21],[-34,4]]);
      this.polygon(g,0xffedbd,[[-34,-10],[0,-27],[34,-10],[0,7]]);
      this.polygon(g,0xd3c59d,[[-34,-10],[0,7],[0,21],[-34,4]]);
      this.polygon(g,0x94af8e,[[0,7],[34,-10],[34,4],[0,21]]);
      // Keep this exact RNG call: scenery must not move the seeded spawn sequence.
      const h=kind==='shrine'?58:this.rng.between(70,101);
      if(kind==='shrine') {
        this.polygon(g,0xffedbe,[[-23,-h],[13,-h],[25,-h+9],[25,-7],[12,3],[-23,-8]]);
        this.polygon(g,0x79a48f,[[13,-h],[25,-h+9],[25,-7],[13,3]]);
        g.fillStyle(0x4f8676).fillRoundedRect(-17,-h+9,26,30,3);
        g.fillStyle(0xd1e3b9).fillRoundedRect(-14,-h+12,20,23,2);
        g.fillStyle(0x536e4d).fillCircle(-9,-h+19,2).fillCircle(1,-h+19,2);
        g.lineStyle(2,0x536e4d).beginPath().arc(-4,-h+23,5,.15,Math.PI-.15).strokePath();
        g.fillStyle(0x8e6896).fillCircle(16,-h+25,3).fillCircle(16,-h+36,3);
        g.fillStyle(0x365e52).fillRoundedRect(-12,-19,22,11,2);
        // A foam-topped milk-tea cup is the little shop's roof sign.
        g.fillStyle(0xf1c97e).fillRoundedRect(-13,-h-21,25,19,4);
        g.fillStyle(0xfff7de).fillEllipse(-1,-h-22,31,11).fillCircle(-9,-h-24,7).fillCircle(2,-h-27,8).fillCircle(10,-h-23,6);
        g.lineStyle(4,0x9878a3).lineBetween(5,-h-28,10,-h-44);
        for(const bx of [-7,0,7])g.fillStyle(0x7d5e55).fillCircle(bx,-h-9,2);
      } else {
        // Cream bottle body, shaded side, crimped mint cap and frog-eye label.
        g.fillStyle(0xeddcae).fillRoundedRect(-19,-h+7,38,h-11,9);
        g.fillStyle(0xfff1ce).fillRoundedRect(-18,-h+7,26,h-13,8);
        g.fillStyle(0xd1c699).fillRect(10,-h+14,7,h-27);
        g.fillStyle(0xe8d6ab).fillRect(-10,-h-10,20,21);
        g.fillStyle(0x77a589).fillRoundedRect(-15,-h-16,30,11,3);
        g.lineStyle(1,0xc8e7bd,.9).lineBetween(-11,-h-13,11,-h-13);
        for(const stripe of [-9,-3,3,9])g.lineStyle(1,0x477b68,.6).lineBetween(stripe,-h-15,stripe,-h-7);
        g.fillStyle(0x83b89c).fillRoundedRect(-17,-h+30,34,29,4);
        for(const side of [-1,1]) {
          g.fillStyle(0xcce6ad).fillCircle(side*8,-h+40,6);
          g.fillStyle(0x2f5843).fillCircle(side*8+1,-h+40,3);
        }
        g.lineStyle(2,0x416e55).beginPath().arc(0,-h+43,7,.2,Math.PI-.2).strokePath();
        g.lineStyle(2,0xffffff,.6).lineBetween(-13,-h+17,-13,-h+27);
        if(index%3===0) {
          g.fillStyle(0xffedab,.12).fillEllipse(0,-h-27,66,47);
          for(const side of [-1,1]) {
            g.lineStyle(3,0x527f67).lineBetween(side*9,-h-16,side*15,-h-30);
            g.fillStyle(0xddedbd).fillCircle(side*16,-h-34,10);
            g.fillStyle(0x85ae65).fillCircle(side*16,-h-34,7);
            g.fillStyle(0x284e36).fillCircle(side*16+2,-h-34,3);
          }
        }
      }
    } else if(kind==='crate') {
      width=56;height=28;
      this.polygon(g,0xffedbd,[[-29,-42],[2,-58],[32,-42],[1,-26]]);
      this.polygon(g,0xe2bf7b,[[-29,-42],[1,-26],[1,5],[-29,-11]]);
      this.polygon(g,0xc9a974,[[1,-26],[32,-42],[32,-11],[1,5]]);
      this.polygon(g,0x8bad93,[[-8,-52],[2,-58],[12,-53],[2,-47]]);
      this.polygon(g,0x8bad93,[[-8,-52],[2,-47],[2,-24],[-8,-29]]);
      g.lineStyle(2,0xfff6d8,.8).lineBetween(-26,-42,2,-56).lineBetween(2,-56,29,-42);
      // A delivery sticker with a tiny emoji face; the package itself remains cover.
      this.polygon(g,0xfff1cc,[[7,-24],[25,-33],[25,-18],[7,-9]]);
      g.fillStyle(0x64815f).fillEllipse(12,-20,3,4).fillEllipse(20,-24,3,4);
      g.lineStyle(1.5,0x64815f).lineBetween(12,-15,16,-15).lineBetween(16,-15,21,-20);
      g.fillStyle(0x9e779d).fillRect(-22,-26,10,3).fillRect(-22,-20,14,2);
    } else {
      width=96;height=29;
      this.polygon(g,0xc1d4ac,[[-53,-40],[35,-40],[52,-29],[-36,-29]]);
      this.polygon(g,0x689a81,[[-53,-40],[-36,-29],[-36,6],[-53,-5]]);
      this.polygon(g,0xe9e3ba,[[-36,-29],[52,-29],[52,6],[-36,6]]);
      this.polygon(g,0xfff0c8,[[-55,-45],[35,-45],[55,-32],[-35,-32]]);
      g.lineStyle(2,0x8fb49a).lineBetween(-34,-27,50,-27).lineBetween(-34,-27,-34,4).lineBetween(-34,4,50,4);
      g.fillStyle(0xf9efd2).fillRoundedRect(-27,-22,70,19,4);
      this.polygon(g,0xf9efd2,[[10,-5],[10,11],[24,-5]]);
      for(const dot of [-12,7,26])g.fillStyle(dot===7?0xa884a2:0x7ca58b).fillCircle(dot,-12,4);
      g.lineStyle(1,0xffffff,.7).lineBetween(-52,-44,35,-44).lineBetween(35,-44,52,-33);
    }
    this.obstacles.push({ x, y, width, height });
    const body = group.create(x, y + 1, 'collider') as Phaser.Physics.Arcade.Image;
    body.setDisplaySize(width, height).setVisible(false).refreshBody();
  }

  private foam(g:Phaser.GameObjects.Graphics,x:number,y:number,size:number):void {
    g.fillStyle(0x6d9f84,.22).fillEllipse(x+2,y+4,size*1.3,size*.5);
    g.fillStyle(0xfff1d0,.9).fillCircle(x,y-size*.15,size*.35).fillCircle(x-size*.29,y,size*.27).fillCircle(x+size*.3,y,size*.3);
    g.fillStyle(0xffffff,.6).fillCircle(x-3,y-size*.28,size*.1);
  }

  private addBotany(): void {
    // Decoration stays outside primary combat paths and has no collision.
    const clumps = [[181, 183], [420, 186], [810, 176], [1130, 170], [1510, 180], [1740, 240], [170, 430], [1730, 505], [176, 930], [1730, 950], [470, 1120], [930, 1115], [1420, 1122]];
    clumps.forEach(([baseX, baseY], i) => {
      const x = baseX + this.rng.between(-18, 18), y = baseY + this.rng.between(-10, 10);
      const g = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100);
      g.fillStyle(0x4d7a68, .2).fillEllipse(8, 4, 65, 20);
      for (let leaf = 0; leaf < 6; leaf++) {
        const dx = this.rng.between(-25, 28), h = this.rng.between(13, 35);
        this.polygon(g, leaf % 2 ? 0x81ae80 : 0x65a287, [[dx - 4, 2], [dx - 12, -h + 5], [dx - 1, -h / 2], [dx + 9, -h], [dx + 5, 2]]);
        g.lineStyle(1, 0xd3e2b7, .7).lineBetween(dx, 0, dx + 4, -h + 3);
      }
      if (i % 2 === 0) {
        g.fillStyle(0xfff3c3, .15).fillEllipse(0, -9, 70, 40);
        this.foam(g,-5,4,27);
        this.foam(g,16,6,17);
      }
    });
  }
}
