import * as Phaser from 'phaser';
import { BOSSES, type BossWave } from '../config';

/** Independent texture keys let later atlas art replace each guardian directly. */
export function generateBossAssets(scene:Phaser.Scene):void {
  for(const wave of [35,75,100] as const) {
    const key=bossTexture(wave);if(scene.textures.exists(key))continue;
    const g=scene.add.graphics(),color=BOSSES[wave].color;
    const poly=(shade:number,points:number[][],alpha=1):void=>{g.fillStyle(shade,alpha).fillPoints(points.map(([x,y])=>new Phaser.Math.Vector2(x,y)),true);};
    g.fillStyle(color,.04).fillCircle(96,85,78);
    if(wave===35) {
      // Broad plated sentinel: split horns, glowing furnace and a heavy halberd.
      poly(0x0a1527,[[44,69],[73,50],[120,50],[151,77],[139,123],[53,123]]);
      poly(0x775136,[[49,73],[77,56],[118,58],[143,79],[133,116],[58,116]]);
      poly(0xc88c4e,[[51,73],[75,62],[83,77],[72,102],[50,93]]);
      poly(0xaa723d,[[116,62],[143,77],[145,98],[125,106],[115,81]]);
      poly(0x302d3a,[[79,76],[111,76],[123,96],[107,115],[83,112],[70,96]]);
      poly(color,[[94,78],[110,94],[99,109],[84,94]]);
      poly(0xffedba,[[95,85],[103,94],[98,101],[91,94]]);
      g.fillStyle(0x17253a).fillRect(57,115,27,39).fillRect(106,115,27,39);
      g.fillStyle(0xb77e49).fillRect(53,143,35,12).fillRect(101,143,36,12);
      poly(0x152033,[[62,32],[79,20],[113,20],[129,37],[119,65],[75,66],[59,50]]);
      poly(0xba834b,[[67,35],[82,25],[110,25],[123,39],[114,59],[78,60],[65,48]]);
      poly(0x183047,[[79,38],[122,37],[117,52],[82,54],[74,46]]);
      g.fillStyle(0xffdc8c).fillRect(91,41,28,6);
      poly(0xe4ba77,[[70,34],[48,5],[77,20],[86,31]]);
      poly(0xb7834c,[[109,23],[142,4],[127,39],[119,44]]);
      g.lineStyle(10,0x0c1b2a).lineBetween(154,47,154,151);
      g.lineStyle(5,0xb98950).lineBetween(154,45,154,150);
      poly(color,[[154,22],[179,37],[184,63],[156,82],[145,65]]);
      poly(0xffecc3,[[159,29],[177,39],[179,60],[164,72],[172,51]]);
      g.fillStyle(0x52383a).fillRect(142,86,26,8);
    } else if(wave===75) {
      // Floating oracle, open crescent crown and luminous satellite crystals.
      poly(0x10172c,[[69,57],[119,57],[145,139],[124,131],[110,154],[95,141],[78,155],[62,132],[43,142]]);
      poly(0x59417e,[[74,65],[114,64],[134,130],[116,121],[104,145],[93,132],[78,145],[70,121],[53,131]]);
      poly(0x9170be,[[74,68],[83,70],[73,121],[60,128]]);
      poly(0x7960ad,[[108,70],[117,95],[115,121],[104,133],[104,93]]);
      g.lineStyle(3,color,.8).lineBetween(78,86,113,86).lineBetween(87,88,88,122).lineBetween(103,88,102,124);
      poly(0x152039,[[63,34],[78,16],[109,14],[127,36],[120,65],[77,69],[61,53]]);
      poly(0x8a69b9,[[69,37],[81,23],[106,21],[120,39],[114,58],[80,61],[68,51]]);
      poly(0x16233c,[[78,38],[116,36],[117,51],[101,61],[78,53]]);
      g.fillStyle(0xf4deff).fillEllipse(98,46,26,9);g.fillStyle(0x704693).fillCircle(100,46,4);
      g.lineStyle(5,color).beginPath().arc(95,31,28,Math.PI*.9,Math.PI*2.05).strokePath();
      for(const [x,y] of [[34,59],[155,57],[44,107],[151,111]]) {
        poly(0x181f3b,[[x,y-18],[x+10,y],[x,y+17],[x-10,y]]);
        poly(color,[[x,y-13],[x+6,y],[x,y+12],[x-6,y]]);
        poly(0xf1deff,[[x,y-9],[x+2,y],[x,y+8],[x-2,y]]);
      }
      g.fillStyle(color,.12).fillEllipse(96,153,64,8);
    } else {
      // Final core: six blade-like wings, porcelain crown and exposed crimson heart.
      for(const sign of [-1,1])for(let i=0;i<3;i++) {
        const px=96+sign*(34+i*12),py=50+i*25;
        poly(0x121b31,[[96+sign*25,py+20],[px,py-15],[96+sign*89,py-24],[96+sign*63,py+10]]);
        poly(i%2?0x426b82:0x8d4a69,[[96+sign*36,py+12],[px,py-9],[96+sign*79,py-19],[96+sign*59,py+4]]);
        g.lineStyle(2,i%2?0x7ee6ec:color,.8).lineBetween(96+sign*42,py+6,96+sign*76,py-15);
      }
      poly(0x13182b,[[65,57],[123,57],[141,99],[124,137],[96,155],[67,135],[52,98]]);
      poly(0x45435f,[[73,64],[117,64],[132,100],[119,130],[96,145],[74,128],[62,100]]);
      poly(0xb3c5c5,[[73,66],[91,64],[82,90],[69,105],[65,96]]);
      poly(0x7b526c,[[104,65],[118,68],[130,98],[116,125],[101,136],[106,102]]);
      poly(0x151a30,[[91,76],[112,91],[110,113],[96,129],[79,110],[79,92]]);
      poly(color,[[96,80],[109,97],[105,114],[96,124],[84,109],[84,96]]);
      poly(0xffd9df,[[96,89],[102,99],[98,113],[91,106],[91,97]]);
      poly(0x171c31,[[71,34],[80,16],[110,16],[123,34],[113,61],[82,61]]);
      poly(0xd5d8d3,[[78,34],[86,22],[106,22],[116,35],[108,53],[85,54]]);
      poly(0x151a2d,[[84,36],[113,34],[108,45],[88,47]]);
      g.fillStyle(color).fillRect(89,37,21,4);
      poly(0xffdbad,[[80,23],[71,3],[91,17],[99,3],[105,18],[125,3],[113,27]]);
      g.lineStyle(2,color,.7).strokeCircle(96,95,41);
    }
    g.generateTexture(key,192,164);g.destroy();
  }
}
export const bossTexture=(wave:BossWave):string=>`boss-${wave}`;
