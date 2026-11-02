import * as Phaser from 'phaser';
import { BOSSES, type BossWave } from '../config';

/** Original internet-noise machines; texture dimensions and floor anchors stay unchanged. */
export function generateBossAssets(scene:Phaser.Scene):void {
  for(const wave of [35,75,100] as const) {
    const key=bossTexture(wave);if(scene.textures.exists(key))continue;
    const g=scene.add.graphics(),color=BOSSES[wave].color;
    const poly=(shade:number,points:number[][],alpha=1):void=>{g.fillStyle(shade,alpha).fillPoints(points.map(([x,y])=>new Phaser.Math.Vector2(x,y)),true);};
    const fan=(x:number,y:number,r:number,blade:number):void=>{
      g.fillStyle(0x292b3b).fillCircle(x,y,r);
      g.lineStyle(2,0xd8999c,.85).strokeCircle(x,y,r-2);
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2+.3,c=Math.cos(a),s=Math.sin(a);
        poly(blade,[[x+c*3,y+s*3],[x+c*r*.85-s*3,y+s*r*.85+c*3],[x+c*r*.5-s*r*.45,y+s*r*.5+c*r*.45],[x-s*5,y+c*5]]);
      }
      g.fillStyle(0xffd0a6).fillCircle(x,y,4);
    };
    g.fillStyle(color,.04).fillCircle(96,85,78);
    if(wave===35) {
      // Repeater foreman: tape-deck eyes, twin speakers, a loop icon and loudhailer arms.
      g.fillStyle(0x302c3b).fillRoundedRect(43,135,46,22,5).fillRoundedRect(105,135,46,22,5);
      for(const x of [49,61,73,111,123,135])g.fillStyle(0x9a6e56).fillRect(x,148,7,6);
      poly(0x3d2937,[[38,40],[143,32],[160,49],[160,135],[143,148],[38,139]]);
      poly(0x976147,[[143,39],[157,51],[157,131],[143,140]]);
      g.fillStyle(0xce8b57).fillRoundedRect(42,39,102,102,8);
      g.fillStyle(0xedb87b).fillRoundedRect(46,42,93,93,5);
      g.lineStyle(3,0xffdba0).strokeRoundedRect(46,42,93,93,5);
      // The raised handle reads as portable audio hardware rather than a crown.
      g.lineStyle(10,0x322c3b).strokeRoundedRect(68,13,54,29,8);
      g.lineStyle(4,0xc18d65).strokeRoundedRect(68,13,54,29,8);
      g.fillStyle(0x493b48).fillRoundedRect(53,54,78,39,4);
      g.fillStyle(0x76605d).fillRect(58,59,68,28);
      for(const x of [73,113]) {
        g.fillStyle(0x2d2e3d).fillCircle(x,73,12);
        g.lineStyle(2,0xf4cc91).strokeCircle(x,73,9);
        for(let i=0;i<6;i++){const a=i*Math.PI/3;g.lineStyle(2,0xd8a66d).lineBetween(x+Math.cos(a)*4,73+Math.sin(a)*4,x+Math.cos(a)*8,73+Math.sin(a)*8);}
        g.fillStyle(0xffedbc).fillCircle(x,73,3);
      }
      g.lineStyle(3,0x3f303b).lineBetween(61,58,82,63).lineBetween(105,63,125,58);
      g.fillStyle(0xf4cf91).fillRect(85,83,16,4);
      fan(70,115,16,0xc68b56);fan(116,115,16,0xc68b56);
      // A two-arrow loop printed on the bridge of the cassette deck.
      g.lineStyle(2,0xffe6ac).beginPath().arc(95,39,9,Math.PI*.15,Math.PI*1.05).strokePath();
      g.lineStyle(2,0xffe6ac).beginPath().arc(95,39,9,Math.PI*1.15,Math.PI*2.05).strokePath();
      g.fillStyle(0xffe6ac).fillTriangle(84,35,91,35,87,42).fillTriangle(106,43,99,43,103,36);
      for(const side of [-1,1]) {
        const x=96+side*69;
        poly(0x3c2c3c,[[x-side*15,66],[x+side*14,51],[x+side*22,59],[x+side*22,101],[x+side*13,109],[x-side*15,92]]);
        poly(0xbb7a4f,[[x-side*11,69],[x+side*13,57],[x+side*16,62],[x+side*16,97],[x+side*12,103],[x-side*11,89]]);
        g.lineStyle(4,0xffd997).lineBetween(x+side*14,63,x+side*14,97);
        g.lineStyle(2,0x62463f).lineBetween(x-side*5,74,x+side*8,67).lineBetween(x-side*5,84,x+side*8,92);
      }
    } else if(wave===75) {
      // Split comment-screen monarch: a pale sarcastic half and a dark angry half.
      g.fillStyle(0x342c49).fillRoundedRect(53,27,88,96,10);
      poly(0x49324f,[[136,31],[150,42],[150,112],[136,128],[136,31]]);
      g.fillStyle(0xcdb3dc).fillRoundedRect(58,32,78,84,7);
      g.fillStyle(0xf0dec8).fillRect(63,39,34,68);
      g.fillStyle(0x775183).fillRect(97,39,34,68);
      g.lineStyle(2,0xb890c6).lineBetween(97,39,97,107);
      poly(0x342c49,[[104,116],[127,116],[112,137]]);
      poly(0xb894ca,[[109,115],[122,115],[112,128]]);
      g.lineStyle(4,0x655168).lineBetween(69,61,88,66).lineBetween(70,72,88,72);
      g.lineStyle(3,0x8b6d7c).lineBetween(73,91,89,86);
      g.lineStyle(4,0xffc6e9).lineBetween(104,64,124,59).lineBetween(105,72,123,72);
      g.fillStyle(0xf3acd3).fillRect(109,86,12,5);
      // Comment cards orbit in place; their bars and quotation glyphs need no font.
      for(const [x,y,w,h,dark] of [[8,50,37,29,0],[146,48,38,31,1],[26,112,43,27,1],[133,118,43,27,0]]) {
        g.fillStyle(0x372b49,.9).fillRoundedRect(x-2,y-2,w+4,h+4,4);
        g.fillStyle(dark?0x84618f:0xead8cb).fillRoundedRect(x,y,w,h,3);
        poly(dark?0x84618f:0xead8cb,[[x+8,y+h-1],[x+8,y+h+8],[x+19,y+h-1]]);
        g.fillStyle(dark?0xefc7e4:0x9b799d).fillRect(x+6,y+7,w-12,3).fillRect(x+6,y+14,w-19,3);
      }
      g.fillStyle(0xc9a7df).fillRect(72,10,7,12).fillRect(83,10,7,12).fillRect(110,10,7,12).fillRect(121,10,7,12);
      poly(0x8d69a6,[[72,21],[79,21],[75,27]]);poly(0x8d69a6,[[110,21],[117,21],[113,27]]);
      for(const [x,y] of [[78,144],[94,151],[111,143]])g.fillStyle(0xcda7df,.7).fillRoundedRect(x,y,9,5,2);
    } else {
      // Overheated controller: server rack, radiator fins, hot fans and thermometer.
      for(const side of [-1,1])for(let i=0;i<5;i++) {
        const x=side<0?24-i*2:145+i*2,y=46+i*18;
        poly(0x3d303e,[[x,y],[x+22,y-4],[x+24,y+8],[x+2,y+13]]);
        g.lineStyle(3,i%2?0xc26e79:0x8c6474).lineBetween(x+3,y+3,x+20,y);
      }
      g.fillStyle(0x302737).fillRoundedRect(52,18,94,139,7);
      poly(0x613847,[[144,23],[156,34],[156,145],[144,156]]);
      g.fillStyle(0x9d4f61).fillRoundedRect(58,23,81,128,5);
      g.lineStyle(2,0xe39294).strokeRoundedRect(58,23,81,128,5);
      g.fillStyle(0x302c3a).fillRoundedRect(66,30,65,23,3);
      g.lineStyle(3,0xff9b8b).lineBetween(74,35,88,40).lineBetween(106,40,122,35);
      g.fillStyle(0xffd9bc).fillRect(81,44,9,3).fillRect(106,44,9,3);
      fan(96,80,23,0xdf7a82);fan(96,129,18,0xc7667b);
      for(let i=0;i<5;i++)g.fillStyle(i<4?0xff9e7e:0x704351).fillRect(126,63+i*9,5,5);
      g.fillStyle(0x3c293a).fillRoundedRect(160,72,15,66,7);
      g.fillStyle(0xf7cfbf).fillRoundedRect(164,76,7,49,3);
      g.fillStyle(0xf16c78).fillRect(166,85,3,40).fillCircle(167,129,6);
      for(let i=0;i<4;i++)g.lineStyle(1,0x6a4652).lineBetween(169,84+i*10,174,84+i*10);
      // A warning lamp and rising heat strokes complete the hot-server silhouette.
      poly(0x392c3a,[[80,20],[96,0],[111,20]]);
      poly(0xffa179,[[85,17],[96,4],[106,17]]);
      g.lineStyle(2,0x663a46).lineBetween(96,8,96,12);g.fillStyle(0x663a46).fillCircle(96,15,1);
      g.fillStyle(0x3d303d).fillRoundedRect(58,151,30,9,2).fillRoundedRect(112,151,30,9,2);
      g.lineStyle(2,0xf0a18d,.8).lineBetween(66,16,63,10).lineBetween(127,14,131,7).lineBetween(148,20,153,15);
    }
    g.generateTexture(key,192,164);g.destroy();
  }
}
export const bossTexture=(wave:BossWave):string=>`boss-${wave}`;
