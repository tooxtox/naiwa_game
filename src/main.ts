import * as Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MenuScene } from './game/scenes/MenuScene';
import { GameScene } from './game/scenes/GameScene';
import { VIEW, WORLD } from './game/config';
import { initFullscreen } from './game/systems/FullscreenManager';
import { AudioManager } from './game/systems/AudioManager';
import './style.css';

initFullscreen();
const game=new Phaser.Game({
  type:Phaser.AUTO,
  parent:'game-container',
  width:VIEW.width,height:VIEW.height,
  backgroundColor:'#163e3b',
  pixelArt:true,roundPixels:true,
  scale:{mode:Phaser.Scale.RESIZE,autoCenter:Phaser.Scale.CENTER_BOTH,width:VIEW.width,height:VIEW.height},
  physics:{default:'arcade',arcade:{gravity:{x:0,y:WORLD.gravity},debug:false}},
  input:{activePointers:4},
  render:{antialias:false,pixelArt:true,powerPreference:'high-performance'},
  fps:{target:60,forceSetTimeOut:false},
  scene:[BootScene,MenuScene,GameScene],
});
// The sound manager lives on the game, so music survives scene changes and restarts.
game.registry.set('audio',AudioManager.boot(game));
if(import.meta.env.DEV) Object.assign(window,{__LUMENFALL__:game,__NAIWA__:game});
window.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('gesturestart',event=>event.preventDefault(),{passive:false});
