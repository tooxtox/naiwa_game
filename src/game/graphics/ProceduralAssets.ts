import * as Phaser from 'phaser';

/** Small, deliberately self-contained textures: replace these keys with an atlas later. */
export function generateAssets(scene: Phaser.Scene): void {
  const texture = (key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    draw(g);
    g.generateTexture(key, width, height);
    g.destroy();
  };
  const shape = (g: Phaser.GameObjects.Graphics, color: number, points: number[][], alpha = 1) => {
    g.fillStyle(color, alpha);
    g.fillPoints(points.map(([x, y]) => new Phaser.Math.Vector2(x, y)), true);
  };

  texture('player', 48, 64, g => {
    // A long scarf, faceted hood, porcelain mask and lit gauntlet give the tiny silhouette identity.
    shape(g, 0x081323, [[8, 24], [20, 21], [27, 34], [10, 43], [0, 37], [8, 34]]);
    shape(g, 0x159caa, [[9, 27], [19, 25], [23, 33], [10, 39], [3, 36], [11, 34]]);
    g.fillStyle(0x071522).fillRect(15, 43, 9, 18).fillRect(27, 42, 10, 20);
    g.fillStyle(0x1a3e55).fillRect(17, 44, 6, 13).fillRect(28, 46, 6, 12);
    g.fillStyle(0x6ce8e1).fillRect(16, 59, 9, 3).fillRect(29, 59, 10, 3);
    shape(g, 0x071321, [[14, 25], [33, 24], [39, 38], [35, 49], [12, 48], [9, 36]]);
    shape(g, 0x27617a, [[17, 25], [30, 25], [35, 39], [31, 46], [15, 45], [13, 35]]);
    shape(g, 0x3b8b98, [[17, 25], [23, 26], [21, 42], [16, 44], [14, 35]]);
    g.fillStyle(0x102737).fillRect(15, 41, 20, 5);
    g.fillStyle(0xf9cc8c).fillRect(24, 41, 5, 4);
    shape(g, 0x061521, [[12, 14], [17, 4], [29, 2], [39, 14], [37, 29], [14, 29]]);
    shape(g, 0x247b8f, [[15, 14], [20, 6], [28, 5], [35, 14], [34, 25], [17, 26]]);
    shape(g, 0x50c4c8, [[17, 13], [21, 7], [27, 6], [24, 13], [17, 20]]);
    shape(g, 0x081c2a, [[22, 13], [33, 12], [35, 19], [30, 26], [21, 25], [18, 20]]);
    shape(g, 0xd4f9e8, [[24, 15], [32, 15], [33, 20], [29, 25], [23, 23]]);
    g.fillStyle(0x092b42).fillRect(27, 17, 7, 3);
    g.fillStyle(0x78fff2).fillRect(31, 17, 4, 2);
    shape(g, 0x0b2639, [[32, 27], [39, 28], [42, 39], [37, 42], [32, 36]]);
    g.fillStyle(0x6ef1e2).fillRect(36, 32, 7, 7);
    g.fillStyle(0xd9fff2).fillRect(39, 32, 4, 3);
    g.fillStyle(0x102636).fillRect(42, 24, 3, 18);
    g.fillStyle(0x7897a5).fillRect(43, 22, 3, 12);
  });

  texture('player-back', 48, 64, g => {
    // Same anchor and silhouette, with a visible hood crown and a flowing rear mantle.
    // Swapping this texture communicates north-facing movement on the ground plane.
    shape(g, 0x071522, [[15, 44], [24, 44], [24, 62], [14, 62]]);
    shape(g, 0x071522, [[28, 43], [37, 43], [39, 62], [28, 62]]);
    g.fillStyle(0x2a5c6b).fillRect(16, 46, 6, 13).fillRect(29, 46, 6, 13);
    g.fillStyle(0x6ce8e1).fillRect(14, 59, 10, 3).fillRect(28, 59, 11, 3);
    shape(g, 0x081a28, [[10, 25], [24, 18], [39, 25], [41, 39], [34, 52], [24, 55], [11, 49], [7, 37]]);
    shape(g, 0x237383, [[12, 27], [24, 21], [36, 27], [37, 39], [32, 49], [24, 51], [13, 46], [11, 36]]);
    shape(g, 0x41a8ad, [[13, 28], [22, 24], [19, 37], [16, 46], [13, 44]]);
    shape(g, 0x125162, [[24, 26], [34, 28], [36, 39], [31, 49], [25, 51], [27, 38]]);
    g.lineStyle(1, 0x74d7ca, .7).lineBetween(13, 29, 22, 25).lineBetween(23, 29, 24, 45);
    shape(g, 0x071321, [[12, 15], [16, 5], [27, 2], [38, 10], [39, 21], [31, 31], [19, 32], [11, 25]]);
    shape(g, 0x287c8e, [[15, 15], [19, 7], [27, 5], [35, 12], [36, 21], [29, 28], [20, 29], [14, 23]]);
    shape(g, 0x50c4c8, [[17, 14], [20, 8], [27, 6], [24, 15], [15, 22]]);
    shape(g, 0x165465, [[25, 15], [35, 13], [36, 21], [29, 28], [21, 28]]);
    g.lineStyle(1, 0x8be7d7, .6).lineBetween(20, 8, 27, 6).lineBetween(27, 6, 34, 12);
    shape(g, 0x63d4c4, [[14, 28], [20, 30], [18, 39], [7, 47], [0, 41], [9, 37]]);
    shape(g, 0x258a94, [[13, 31], [17, 32], [15, 38], [7, 43], [3, 41], [10, 37]]);
    shape(g, 0x1d3e50, [[34, 27], [40, 27], [43, 37], [37, 41], [32, 34]]);
    g.fillStyle(0x6ef1e2).fillRect(36, 31, 7, 6);
    g.fillStyle(0xd9fff2).fillRect(38, 31, 5, 2);
    g.fillStyle(0x102636).fillRect(42, 24, 3, 18);
    g.fillStyle(0x9fbcc1).fillRect(43, 22, 3, 12);
  });

  texture('enemy-melee', 46, 54, g => {
    shape(g, 0x1c142a, [[8, 25], [28, 22], [37, 37], [32, 46], [10, 46], [5, 35]]);
    g.fillStyle(0x151729).fillRect(10, 39, 9, 14).fillRect(27, 40, 9, 13);
    g.fillStyle(0xb25575).fillRect(9, 49, 12, 4).fillRect(26, 49, 12, 4);
    shape(g, 0x73344e, [[10, 27], [27, 25], [33, 37], [29, 44], [12, 43], [8, 35]]);
    shape(g, 0xb65471, [[11, 28], [17, 25], [24, 29], [20, 38], [10, 36]]);
    g.fillStyle(0x3b233d).fillRect(12, 39, 21, 5);
    g.fillStyle(0xffa28d).fillRect(22, 40, 4, 3);
    shape(g, 0x171b2d, [[9, 13], [16, 6], [31, 5], [37, 16], [34, 26], [14, 29], [7, 21]]);
    shape(g, 0x9b4867, [[11, 14], [17, 8], [29, 8], [33, 16], [31, 24], [16, 26], [10, 21]]);
    shape(g, 0xe58592, [[12, 14], [18, 9], [24, 9], [20, 14], [12, 19]]);
    shape(g, 0x090f22, [[20, 15], [34, 14], [33, 21], [21, 23], [17, 20]]);
    g.fillStyle(0xffd09a).fillRect(26, 16, 8, 3);
    shape(g, 0xff91a0, [[11, 12], [7, 1], [17, 9]]);
    shape(g, 0x713550, [[28, 8], [37, 2], [34, 15]]);
    shape(g, 0x5d2e49, [[32, 27], [40, 29], [40, 38], [33, 40]]);
    g.fillStyle(0x1a1b2d).fillRect(39, 19, 3, 25);
    shape(g, 0xffbe9c, [[40, 7], [45, 14], [44, 28], [40, 32]]);
    g.fillStyle(0x9f6278).fillRect(37, 31, 8, 3);
  });

  texture('enemy-ranged', 46, 56, g => {
    g.fillStyle(0x7e54d0, 0.12).fillCircle(23, 29, 21);
    shape(g, 0x15162f, [[15, 20], [31, 20], [39, 48], [33, 51], [28, 46], [22, 54], [17, 47], [8, 50]]);
    shape(g, 0x59418c, [[18, 22], [28, 23], [35, 45], [29, 43], [23, 49], [17, 43], [12, 46]]);
    shape(g, 0x9c70da, [[18, 24], [22, 24], [19, 41], [14, 44]]);
    g.fillStyle(0x2c244f).fillRect(17, 31, 15, 5);
    g.fillStyle(0xdcb6ff).fillRect(22, 31, 5, 5);
    shape(g, 0x15172d, [[10, 17], [14, 9], [25, 2], [34, 11], [36, 22], [29, 29], [14, 26]]);
    shape(g, 0x8a65b9, [[14, 17], [17, 11], [25, 6], [30, 13], [32, 21], [27, 25], [17, 23]]);
    shape(g, 0x22233c, [[19, 15], [31, 15], [30, 22], [23, 25], [17, 21]]);
    g.fillStyle(0xf1caff).fillRect(23, 17, 9, 3);
    shape(g, 0xb38bea, [[12, 13], [9, 5], [18, 10]]);
    g.fillStyle(0x1b1d35).fillRect(38, 14, 3, 36);
    g.lineStyle(2, 0xc896ed).strokeCircle(39, 10, 6);
    g.fillStyle(0xffb5c6).fillCircle(39, 10, 3);
    shape(g, 0xa97acb, [[30, 28], [35, 27], [40, 32], [37, 37], [31, 34]]);
    g.fillStyle(0xd6baff, 0.65).fillRect(9, 51, 3, 3).fillRect(31, 53, 3, 2);
  });

  texture('enemy-elite', 68, 76, g => {
    g.fillStyle(0xff9d4d, 0.07).fillCircle(34, 35, 32);
    shape(g, 0x161c2a, [[14, 30], [47, 28], [58, 47], [51, 63], [15, 62], [7, 43]]);
    g.fillStyle(0x192132).fillRect(17, 58, 12, 17).fillRect(40, 58, 12, 17);
    g.fillStyle(0xb27348).fillRect(13, 69, 18, 6).fillRect(39, 69, 17, 6);
    shape(g, 0x71543e, [[17, 31], [44, 31], [52, 47], [46, 59], [18, 58], [12, 44]]);
    shape(g, 0xbb8350, [[18, 32], [27, 30], [31, 40], [26, 50], [15, 45]]);
    shape(g, 0xf2b76b, [[18, 33], [25, 32], [27, 38], [19, 40]]);
    shape(g, 0x3d3540, [[28, 35], [41, 35], [45, 47], [35, 54], [25, 47]]);
    shape(g, 0xffc879, [[31, 39], [38, 39], [40, 46], [35, 50], [30, 46]]);
    g.fillStyle(0xffead0).fillRect(33, 41, 4, 5);
    g.fillStyle(0x302b33).fillRect(15, 55, 35, 7);
    g.fillStyle(0xc99352).fillRect(29, 56, 10, 6);
    shape(g, 0x191e2d, [[17, 15], [25, 7], [43, 6], [51, 19], [46, 32], [23, 33], [15, 25]]);
    shape(g, 0xab784b, [[20, 16], [26, 10], [41, 10], [46, 20], [42, 29], [25, 29], [20, 24]]);
    shape(g, 0xffc97e, [[21, 16], [27, 11], [34, 11], [29, 17], [21, 21]]);
    shape(g, 0x242537, [[28, 18], [48, 17], [44, 26], [29, 27], [25, 23]]);
    g.fillStyle(0xffdc9e).fillRect(34, 19, 13, 4);
    shape(g, 0xd4a36c, [[20, 14], [13, 1], [28, 9]]);
    shape(g, 0xa97a50, [[41, 9], [56, 1], [48, 19]]);
    shape(g, 0xa17648, [[44, 32], [56, 31], [60, 43], [52, 47], [44, 41]]);
    g.fillStyle(0x292631).fillRect(59, 24, 4, 40);
    shape(g, 0xf5c180, [[59, 15], [67, 19], [67, 37], [61, 43], [57, 34]]);
    g.fillStyle(0x9b6450).fillRect(55, 44, 12, 4);
  });

  texture('bullet', 16, 16, g => {
    g.fillStyle(0xff835e, 0.12).fillCircle(8, 8, 8);
    g.fillStyle(0xff835e, 0.34).fillCircle(8, 8, 6);
    shape(g, 0xffa371, [[8, 2], [14, 8], [8, 14], [2, 8]]);
    shape(g, 0xffe3a9, [[8, 4], [12, 8], [8, 12], [4, 8]]);
    g.fillStyle(0xfff7da).fillRect(6, 6, 4, 4);
  });
  texture('spark', 8, 8, g => {
    g.fillStyle(0xffffff, 0.2).fillRect(0, 2, 8, 4).fillRect(2, 0, 4, 8);
    g.fillStyle(0xffffff).fillRect(2, 2, 4, 4);
  });
  // Physics references this key, while the map draws and sorts obstacle art independently.
  texture('collider', 2, 2, g => { g.fillStyle(0xffffff).fillRect(0, 0, 2, 2); });

  texture('ground', 96, 76, g => {
    g.fillStyle(0x101b30).fillRect(0, 0, 96, 76);
    g.fillStyle(0x224151).fillRect(0, 4, 96, 18);
    g.fillStyle(0x2f5961).fillRect(0, 2, 96, 6);
    g.fillStyle(0x5ca59a).fillRect(0, 0, 96, 3);
    g.fillStyle(0x8ec7aa).fillRect(4, 0, 25, 2).fillRect(56, 0, 20, 2);
    g.fillStyle(0x153044).fillRect(7, 10, 26, 5).fillRect(46, 11, 18, 7).fillRect(79, 9, 12, 5);
    g.fillStyle(0x1c2d43).fillRect(0, 26, 96, 2).fillRect(0, 54, 96, 2);
    g.fillStyle(0x1c3046).fillRect(7, 30, 32, 19).fillRect(47, 29, 39, 20).fillRect(15, 59, 54, 17);
    g.fillStyle(0x263c50).fillRect(10, 31, 27, 2).fillRect(50, 30, 33, 2);
    g.fillStyle(0x0b1528).fillRect(42, 27, 3, 27).fillRect(12, 55, 3, 21).fillRect(74, 55, 3, 21);
    g.fillStyle(0x3c756e).fillRect(2, 6, 6, 6).fillRect(87, 5, 5, 8).fillRect(31, 4, 8, 4);
    g.fillStyle(0x63d4bc, 0.35).fillRect(64, 34, 3, 8).fillRect(61, 37, 9, 2);
  });
  texture('platform', 96, 18, g => {
    shape(g, 0x102438, [[0, 2], [96, 2], [96, 11], [88, 18], [10, 18], [0, 11]]);
    g.fillStyle(0x315165).fillRect(0, 2, 96, 8);
    g.fillStyle(0x67b9b2).fillRect(0, 0, 96, 3);
    g.fillStyle(0x9ad7bd).fillRect(4, 0, 31, 2).fillRect(54, 0, 29, 2);
    g.fillStyle(0x243e54).fillRect(10, 7, 21, 5).fillRect(41, 7, 23, 5).fillRect(73, 7, 14, 5);
    g.fillStyle(0x427477).fillRect(10, 6, 21, 2).fillRect(73, 6, 14, 2);
    g.fillStyle(0x6ad7c1, 0.55).fillRect(47, 8, 3, 5);
  });
}
