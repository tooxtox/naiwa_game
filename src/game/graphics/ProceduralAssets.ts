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
    // A walking repeat-message: the face is a chat bubble, the shield is a copied post.
    g.fillStyle(0x542339).fillRoundedRect(10, 39, 9, 14, 3).fillRoundedRect(27, 39, 9, 14, 3);
    g.fillStyle(0xffa6ac).fillRect(8, 49, 13, 4).fillRect(26, 49, 13, 4);
    g.fillStyle(0x5e2946).fillRoundedRect(7, 24, 31, 21, 7);
    g.fillStyle(0xc45176).fillRoundedRect(10, 25, 25, 17, 5);
    g.fillStyle(0x702a4c).fillRoundedRect(4, 4, 36, 29, 8);
    g.fillStyle(0xffb4b2).fillRoundedRect(6, 5, 32, 24, 6);
    shape(g, 0xffb4b2, [[10, 26], [12, 35], [21, 26]]);
    g.fillStyle(0x682e4b).fillRect(12, 13, 5, 4).fillRect(27, 13, 5, 4);
    g.lineStyle(2, 0x92394e).lineBetween(16, 22, 28, 22);
    // Double quotation bars make the repeating motif legible without a font or asset.
    g.fillStyle(0xfff1d8).fillRect(11, 6, 5, 3).fillRect(19, 6, 5, 3);
    g.fillStyle(0x77394f).fillRoundedRect(30, 30, 14, 15, 3);
    g.fillStyle(0xffd8ba).fillRoundedRect(32, 31, 10, 11, 2);
    g.fillStyle(0xc0576b).fillRect(34, 34, 6, 2).fillRect(34, 38, 6, 2);
  });

  texture('enemy-ranged', 46, 56, g => {
    // A floating comment terminal: purple speech screen, yin/yang eyes and three transmitters.
    g.fillStyle(0xa75be1, .13).fillEllipse(23, 30, 44, 48);
    g.fillStyle(0x40294f).fillRoundedRect(11, 39, 9, 15, 3).fillRoundedRect(27, 39, 9, 15, 3);
    g.fillStyle(0xc49ae7).fillRect(9, 51, 13, 3).fillRect(26, 51, 12, 3);
    shape(g, 0x5e3e85, [[10, 29], [36, 29], [39, 47], [29, 43], [24, 48], [18, 43], [7, 47]]);
    g.fillStyle(0x573778).fillRoundedRect(4, 7, 37, 28, 7);
    g.fillStyle(0xb797df).fillRoundedRect(7, 9, 31, 22, 5);
    g.fillStyle(0x352840).fillRoundedRect(10, 12, 25, 14, 3);
    g.fillStyle(0xf9edff).fillCircle(16, 18, 4);
    g.fillStyle(0xae7bd4).fillCircle(28, 18, 4);
    g.fillStyle(0x352840).fillCircle(17, 18, 2);
    g.fillStyle(0xffe8ff).fillCircle(27, 18, 2);
    g.lineStyle(2, 0x8e6ab1).lineBetween(22, 7, 22, 3);
    g.fillStyle(0xf2b6e2).fillCircle(22, 3, 3);
    g.fillStyle(0xffe4ef).fillCircle(16, 35, 2).fillCircle(23, 35, 2).fillCircle(30, 35, 2);
    g.lineStyle(3, 0x553867).lineBetween(40, 24, 40, 48);
    g.fillStyle(0xd4a6f1).fillCircle(40, 23, 5);
    g.fillStyle(0xffd5df).fillCircle(40, 23, 2);
  });

  texture('enemy-elite', 68, 76, g => {
    // A red-hot moderator in a chunky safety vest, with a visible heat meter and stop paddle.
    g.fillStyle(0xe97955, .1).fillEllipse(34, 39, 66, 68);
    g.fillStyle(0x56303c).fillRoundedRect(15, 55, 14, 20, 4).fillRoundedRect(40, 55, 14, 20, 4);
    g.fillStyle(0xd86c58).fillRect(12, 69, 19, 6).fillRect(39, 69, 18, 6);
    g.fillStyle(0x713546).fillRoundedRect(8, 26, 49, 37, 9);
    g.fillStyle(0xe5895b).fillRoundedRect(12, 27, 41, 31, 7);
    g.fillStyle(0xffd493).fillRect(19, 28, 5, 28).fillRect(43, 28, 5, 28).fillRect(13, 45, 39, 5);
    g.fillStyle(0x9b3f46).fillRoundedRect(4, 31, 12, 21, 4).fillRoundedRect(50, 31, 12, 21, 4);
    g.fillStyle(0x743344).fillRoundedRect(15, 6, 37, 28, 9);
    g.fillStyle(0xf1a16e).fillRoundedRect(19, 9, 29, 21, 7);
    g.fillStyle(0xe15d5d).fillRoundedRect(14, 3, 40, 13, 6);
    g.fillStyle(0xffce91).fillRect(13, 12, 42, 4);
    g.fillStyle(0x693040).fillRect(25, 19, 6, 4).fillRect(38, 19, 6, 4);
    g.lineStyle(2, 0x973f4a).lineBetween(29, 27, 39, 27);
    g.fillStyle(0x66303e).fillRoundedRect(28, 33, 11, 18, 3);
    g.fillStyle(0xffeed3).fillRect(31, 35, 5, 12);
    g.fillStyle(0xf7515a).fillRect(31, 39, 5, 8);
    g.lineStyle(4, 0x673440).lineBetween(61, 32, 61, 61);
    g.fillStyle(0x76313f).fillCircle(61, 29, 7);
    g.fillStyle(0xff7c76).fillCircle(61, 28, 5);
    g.fillStyle(0xffead0).fillRect(58, 27, 6, 2);
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
