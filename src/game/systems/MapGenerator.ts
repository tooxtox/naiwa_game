import * as Phaser from 'phaser';
import { WORLD } from '../config';

export interface MapResult {
  /** Invisible, low foot boxes. Visual height never changes collision height. */
  platforms: Phaser.Physics.Arcade.StaticGroup;
  spawnPoints: { x: number; y: number }[];
}

type PropKind = 'pillar' | 'crate' | 'wall' | 'shrine';
interface Obstacle { x: number; y: number; width: number; height: number; }

/** Screen-space ground plane: the artwork supplies the 2.5D height, physics remains two-dimensional. */
export class MapGenerator {
  private readonly rng: Phaser.Math.RandomDataGenerator;
  private readonly obstacles: Obstacle[] = [];

  constructor(private readonly scene: Phaser.Scene, public readonly seed: string) {
    this.rng = new Phaser.Math.RandomDataGenerator([seed]);
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
      const x = baseX + this.rng.between(-26, 26), y = baseY + this.rng.between(-22, 22);
      this.addObstacle(platforms, x, y, kind, index);
    });
    this.addBotany();
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
    return { platforms, spawnPoints };
  }

  private polygon(g: Phaser.GameObjects.Graphics, color: number, coords: number[][], alpha = 1): void {
    g.fillStyle(color, alpha).fillPoints(coords.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  }

  private drawGround(): void {
    const g = this.scene.add.graphics().setDepth(-200);
    const width = WORLD.width, height = WORLD.height;
    g.fillStyle(0x07131f).fillRect(0, 0, width, height);
    // A shallow, luminous moat visible around every side anchors the camera above the scene.
    g.fillStyle(0x0b2934).fillRoundedRect(30, 35, width - 60, height - 68, 52);
    g.lineStyle(2, 0x176172, .4).strokeRoundedRect(40, 45, width - 80, height - 88, 46);
    g.lineStyle(2, 0x2ca49e, .18).strokeRoundedRect(59, 65, width - 118, height - 128, 32);
    for (let i = 0; i < 140; i++) {
      const x = this.rng.between(25, width - 25), y = this.rng.between(30, height - 25);
      if (x > 90 && x < width - 90 && y > 95 && y < height - 90) continue;
      g.lineStyle(1, 0x55b4ad, this.rng.realInRange(.12, .35)).lineBetween(x, y, x + this.rng.between(5, 22), y);
    }
    // Extruded southern and eastern edges distinguish the floor from a flat orthogonal map.
    g.fillStyle(0x091826).fillRoundedRect(92, 108, width - 176, height - 160, 18);
    g.fillStyle(0x173346).fillRoundedRect(84, 93, width - 168, height - 186, 14);
    g.fillStyle(0x244656).fillRoundedRect(84, 88, width - 168, height - 194, 12);
    g.fillStyle(0x152a3b).fillRoundedRect(100, 105, width - 200, height - 224, 5);
    g.lineStyle(2, 0x4b7a80, .7).strokeRoundedRect(94, 99, width - 188, height - 212, 6);

    // Diamond paving supplies perspective without changing the actual ground coordinate system.
    const tw = 112, th = 60;
    const tileColors = [0x1b3345, 0x1d3648, 0x20394a, 0x1b3447, 0x203a49, 0x223a49];
    for (let row = 0; row < 34; row++) {
      const y = 130 + row * th / 2;
      for (let col = 0; col < 16; col++) {
        const x = 126 + col * tw + (row % 2) * tw / 2;
        if (x + tw / 2 > width - 102 || y + th / 2 > height - 122) continue;
        if (x - tw / 2 < 101 || y - th / 2 < 106) continue;
        const points = [[x, y - th / 2 + 1], [x + tw / 2 - 1, y], [x, y + th / 2 - 1], [x - tw / 2 + 1, y]];
        this.polygon(g, this.rng.pick(tileColors), points);
        g.lineStyle(1, 0x3b5664, .55).lineBetween(x - tw / 2 + 2, y, x, y - th / 2 + 2).lineBetween(x, y - th / 2 + 2, x + tw / 2 - 2, y);
        if (this.rng.frac() < .12) {
          g.lineStyle(1, 0x0b202f, .7).lineBetween(x - 9, y - 15, x + 7, y - 4).lineBetween(x + 7, y - 4, x + 3, y + 8);
        }
      }
    }
    // Long inlaid causeways help the player read the traversable ground at a glance.
    g.fillStyle(0x263f4e, .52).fillRect(112, 604, width - 224, 72).fillRect(925, 118, 70, height - 254);
    g.lineStyle(1, 0x547d7c, .35).lineBetween(112, 608, width - 112, 608).lineBetween(112, 672, width - 112, 672);
    g.lineStyle(1, 0x547d7c, .35).lineBetween(929, 118, 929, height - 136).lineBetween(991, 118, 991, height - 136);
    for (let x = 170; x < width - 140; x += 120) {
      g.lineStyle(1, 0x69d7ba, .45).lineBetween(x, 620, x + 10, 626).lineBetween(x + 10, 626, x, 632);
      g.lineStyle(1, 0x69d7ba, .35).lineBetween(x, 652, x + 10, 658).lineBetween(x + 10, 658, x, 664);
    }
    // Small border stones, with their upper bevel and exposed side face.
    for (let x = 110; x < width - 120; x += 70) {
      g.fillStyle(0x102636).fillRect(x, 109, 61, 17).fillRect(x, height - 143, 61, 20);
      g.fillStyle(0x345260).fillRect(x, 107, 61, 7).fillRect(x, height - 148, 61, 8);
      g.lineStyle(1, 0x608486, .7).lineBetween(x + 2, 108, x + 58, 108).lineBetween(x + 2, height - 147, x + 58, height - 147);
    }
    for (let y = 145; y < height - 170; y += 63) {
      g.fillStyle(0x2e4d5a).fillRect(100, y, 18, 55).fillRect(width - 119, y, 18, 55);
      g.fillStyle(0x152f41).fillRect(103, y + 9, 13, 43).fillRect(width - 116, y + 9, 13, 43);
    }
    for (let i = 0; i < 95; i++) {
      const x = this.rng.between(130, width - 130), y = this.rng.between(150, height - 170);
      if (Phaser.Math.Distance.Between(x, y, width / 2, height / 2) < 150) continue;
      g.fillStyle(0x5e7e78, .16).fillEllipse(x, y, this.rng.between(9, 26), 4);
      g.fillStyle(0x081d2d, .38).fillRect(x + 4, y + 4, 3, 2);
    }
    this.drawSigil(g, width / 2, height / 2);
    // Bake hundreds of paving polygons into one draw surface; all geometry is static.
    const floor = this.scene.add.renderTexture(0, 0, width, height).setOrigin(0).setDepth(-200);
    floor.draw(g);
    // Phaser 4 buffers draw commands; flush while the source Graphics is still alive.
    floor.render();
    g.destroy();
  }

  private drawSigil(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x071e2b, .65).fillEllipse(x, y, 370, 220);
    g.fillStyle(0x3caa9c, .025).fillEllipse(x, y, 420, 250);
    for (const [w, h, alpha] of [[354, 208, .3], [336, 194, .75], [314, 182, .22], [265, 155, .7]]) {
      g.lineStyle(2, 0x65dec5, alpha).strokeEllipse(x, y, w, h);
    }
    g.lineStyle(3, 0x2b756e, .9).strokeEllipse(x, y, 294, 171);
    const points = Array.from({ length: 6 }, (_, i) => new Phaser.Math.Vector2(x + Math.cos(i * Math.PI / 3) * 112, y + Math.sin(i * Math.PI / 3) * 65));
    g.lineStyle(1, 0x6eecd0, .6).strokePoints([points[0], points[2], points[4]], true).strokePoints([points[1], points[3], points[5]], true);
    this.polygon(g, 0x2b7b79, [[x, y - 44], [x + 35, y - 1], [x, y + 43], [x - 35, y - 1]], .3);
    g.lineStyle(2, 0x9af2d4, .7).strokePoints([new Phaser.Math.Vector2(x, y - 38), new Phaser.Math.Vector2(x + 31, y), new Phaser.Math.Vector2(x, y + 38), new Phaser.Math.Vector2(x - 31, y)], true);
    g.lineStyle(2, 0xb1f8d8, .8).lineBetween(x - 16, y, x + 16, y).lineBetween(x, y - 18, x, y + 18);
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8;
      const cx = x + Math.cos(a) * 161, cy = y + Math.sin(a) * 94;
      g.lineStyle(2, 0x80e6cf, .6).lineBetween(cx - 3, cy - 4, cx + 3, cy + 4).lineBetween(cx + 3, cy - 4, cx - 3, cy + 4);
    }
  }

  private addObstacle(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, kind: PropKind, index: number): void {
    const g = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100);
    let width = 44, height = 30;
    g.fillStyle(0x050e19, .38).fillEllipse(12, 9, kind === 'wall' ? 130 : 90, 33);
    if (kind === 'pillar' || kind === 'shrine') {
      width = 46; height = 28;
      // Foot plinth, vertical sides and a diamond-shaped top make the height unambiguous.
      this.polygon(g, 0x102434, [[-34, -10], [0, -27], [34, -10], [34, 4], [0, 21], [-34, 4]]);
      this.polygon(g, 0x315060, [[-34, -10], [0, -27], [34, -10], [0, 7]]);
      this.polygon(g, 0x203c4e, [[-34, -10], [0, 7], [0, 21], [-34, 4]]);
      this.polygon(g, 0x142d3e, [[0, 7], [34, -10], [34, 4], [0, 21]]);
      const h = kind === 'shrine' ? 58 : this.rng.between(70, 101);
      this.polygon(g, 0x284658, [[-22, -h], [0, -h + 11], [0, 3], [-22, -8]]);
      this.polygon(g, 0x172f42, [[0, -h + 11], [22, -h], [22, -8], [0, 3]]);
      this.polygon(g, 0x476977, [[-27, -h - 7], [0, -h - 21], [27, -h - 7], [0, -h + 7]]);
      this.polygon(g, 0x2b4a5e, [[-27, -h - 7], [0, -h + 7], [0, -h + 15], [-27, -h - 0]]);
      this.polygon(g, 0x1b364b, [[0, -h + 7], [27, -h - 7], [27, -h], [0, -h + 15]]);
      g.lineStyle(1, 0x86b4ad, .75).lineBetween(-26, -h - 7, 0, -h - 20).lineBetween(0, -h - 20, 26, -h - 7);
      g.lineStyle(2, 0x37596a).lineBetween(-16, -h + 6, -16, -18).lineBetween(13, -h + 15, 13, -14);
      for (let sy = -h + 29; sy < -17; sy += 23) g.lineStyle(1, 0x0f2536).lineBetween(-21, sy - 11, 0, sy).lineBetween(0, sy, 22, sy - 11);
      if (kind === 'shrine' || index % 3 === 0) {
        g.fillStyle(0x48dec5, .1).fillEllipse(0, -h - 18, 67, 46);
        this.crystal(g, 0, -h - 12, 26, 0x79eed4, 0x3c9eaa);
        g.lineStyle(2, 0x70d6c3, .9).lineBetween(-8, -h + 20, -8, -h + 39).lineBetween(-12, -h + 27, -4, -h + 31);
      } else {
        // A fractured upper face rather than identical perfect columns.
        g.lineStyle(2, 0x183143).lineBetween(-8, -h - 15, -3, -h - 7).lineBetween(-3, -h - 7, 9, -h - 4);
      }
    } else if (kind === 'crate') {
      width = 56; height = 28;
      this.polygon(g, 0x3d3d54, [[-29, -42], [2, -58], [32, -42], [1, -26]]);
      this.polygon(g, 0x303045, [[-29, -42], [1, -26], [1, 5], [-29, -11]]);
      this.polygon(g, 0x212a40, [[1, -26], [32, -42], [32, -11], [1, 5]]);
      g.lineStyle(3, 0x687184).lineBetween(-26, -41, 1, -28).lineBetween(1, -28, 29, -42).lineBetween(-26, -13, 1, 1).lineBetween(1, 1, 29, -13);
      g.lineStyle(2, 0x4b6071).lineBetween(-23, -39, -23, -16).lineBetween(-4, -29, -4, -4).lineBetween(7, -28, 7, -3).lineBetween(26, -39, 26, -16);
      g.lineStyle(2, 0x8992a1, .65).lineBetween(-26, -42, 2, -56).lineBetween(2, -56, 29, -42);
      g.lineStyle(2, 0xa2a1b3, .4).lineBetween(-24, -37, -5, -8).lineBetween(8, -10, 25, -36);
      this.polygon(g, 0x91e7cd, [[-14, -47], [2, -55], [8, -52], [-8, -44]], .65);
    } else {
      width = 96; height = 29;
      this.polygon(g, 0x223f51, [[-53, -40], [35, -40], [52, -29], [-36, -29]]);
      this.polygon(g, 0x1b3447, [[-53, -40], [-36, -29], [-36, 6], [-53, -5]]);
      this.polygon(g, 0x294658, [[-36, -29], [52, -29], [52, 6], [-36, 6]]);
      this.polygon(g, 0x4b6975, [[-55, -45], [35, -45], [55, -32], [-35, -32]]);
      g.fillStyle(0x254253).fillRect(-35, -32, 90, 7);
      g.lineStyle(1, 0x88aaa3, .7).lineBetween(-53, -44, 35, -44).lineBetween(35, -44, 53, -32);
      g.lineStyle(2, 0x122c3e).lineBetween(-34, -11, 51, -11).lineBetween(-11, -25, -11, -12).lineBetween(25, -25, 25, -12).lineBetween(8, -10, 8, 5);
      g.lineStyle(1, 0x52737b, .65).lineBetween(-31, -23, -15, -23).lineBetween(29, -23, 45, -23);
      g.fillStyle(0x3c6c62).fillRect(-26, -45, 17, 4).fillRect(12, -44, 14, 3);
    }
    this.obstacles.push({ x, y, width, height });
    const body = group.create(x, y + 1, 'collider') as Phaser.Physics.Arcade.Image;
    body.setDisplaySize(width, height).setVisible(false).refreshBody();
  }

  private crystal(g: Phaser.GameObjects.Graphics, x: number, y: number, height: number, light: number, dark: number): void {
    this.polygon(g, 0x0d2c3a, [[x - 10, y - 7], [x - 7, y - height + 5], [x, y - height - 2], [x + 9, y - height + 7], [x + 8, y - 6], [x, y]]);
    this.polygon(g, light, [[x - 7, y - 8], [x - 5, y - height + 6], [x, y - height], [x, y - 2]]);
    this.polygon(g, dark, [[x, y - height], [x + 6, y - height + 7], [x + 6, y - 8], [x, y - 2]]);
    g.lineStyle(1, 0xd1ffdf, .9).lineBetween(x - 5, y - height + 6, x, y - height);
  }

  private addBotany(): void {
    // Decoration stays outside primary combat paths and has no collision.
    const clumps = [[181, 183], [420, 186], [810, 176], [1130, 170], [1510, 180], [1740, 240], [170, 430], [1730, 505], [176, 930], [1730, 950], [470, 1120], [930, 1115], [1420, 1122]];
    clumps.forEach(([baseX, baseY], i) => {
      const x = baseX + this.rng.between(-18, 18), y = baseY + this.rng.between(-10, 10);
      const g = this.scene.add.graphics().setPosition(x, y).setDepth(y + 100);
      g.fillStyle(0x081925, .45).fillEllipse(8, 4, 65, 20);
      for (let leaf = 0; leaf < 6; leaf++) {
        const dx = this.rng.between(-25, 28), h = this.rng.between(13, 35);
        this.polygon(g, leaf % 2 ? 0x2f625f : 0x224b51, [[dx - 4, 2], [dx - 12, -h + 5], [dx - 1, -h / 2], [dx + 9, -h], [dx + 5, 2]]);
        g.lineStyle(1, 0x4a9182, .55).lineBetween(dx, 0, dx + 4, -h + 3);
      }
      if (i % 2 === 0) {
        g.fillStyle(0x46b9bd, .07).fillEllipse(0, -9, 70, 40);
        this.crystal(g, -5, 4, 35, 0x60bbbe, 0x32657f);
        this.crystal(g, 11, 6, 23, 0x81b1df, 0x54437a);
      }
    });
  }
}
