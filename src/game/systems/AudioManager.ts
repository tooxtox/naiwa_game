import * as Phaser from 'phaser';
import type { ClassId } from '../config';

/** Each class has a distinct sound for its three repeatable actions. */
export type ClassAction = 'attack' | 'dash' | 'guard';
type ClassSfxId = `${ClassId}-${ClassAction}`;

/** Every one-shot effect that the game can trigger. */
export type SfxId =
  | 'swing' | 'shoot' | 'hit' | 'crit' | 'kill' | 'dash' | 'guard' | 'parry'
  | 'hurt' | 'ultimate' | 'upgrade' | 'wave' | 'death' | 'ui' | 'enemy-shot'
  | ClassSfxId;

/** Identifier of a background track. */
export type BgmId = 'menu' | 'warrior' | 'mage' | 'archer';

const SFX_FILES: Record<SfxId, string> = {
  swing: 'sfx-swing',
  shoot: 'sfx-shoot',
  hit: 'sfx-hit',
  crit: 'sfx-crit',
  kill: 'sfx-kill',
  dash: 'sfx-dash',
  guard: 'sfx-guard',
  parry: 'sfx-parry',
  hurt: 'sfx-hurt',
  ultimate: 'sfx-ultimate',
  upgrade: 'sfx-upgrade',
  wave: 'sfx-wave',
  death: 'sfx-death',
  ui: 'sfx-ui',
  'enemy-shot': 'sfx-enemy-shot',
  'warrior-attack': 'sfx-warrior-attack',
  'warrior-dash': 'sfx-warrior-dash',
  'warrior-guard': 'sfx-warrior-guard',
  'mage-attack': 'sfx-mage-attack',
  'mage-dash': 'sfx-mage-dash',
  'mage-guard': 'sfx-mage-guard',
  'archer-attack': 'sfx-archer-attack',
  'archer-dash': 'sfx-archer-dash',
  'archer-guard': 'sfx-archer-guard',
};

const BGM_FILES: Record<BgmId, string> = {
  menu: 'bgm-menu',
  warrior: 'bgm-warrior',
  mage: 'bgm-mage',
  archer: 'bgm-archer',
};

/** Assets the boot scene has to load before any sound can be played. */
export const AUDIO_ASSETS: { key: string; url: string }[] = [
  ...Object.values(BGM_FILES).map(key => ({ key, url: `./assets/audio/${key}.mp3` })),
  // The previous public files included silent buffers; refresh returning players' cached bank.
  ...Object.values(SFX_FILES).map(key => ({ key, url: `./assets/audio/${key}.wav?v=2` })),
];

/** Sounds that repeat while the game runs need their own voice per overlap. */
const VOICES_PER_EFFECT = 3;

type Voice = Phaser.Sound.BaseSound & {
  setVolume?: (value: number) => unknown;
  setRate?: (value: number) => unknown;
};

/**
 * Owns every sound in the game.
 *
 * The manager lives on the Phaser game rather than on a scene, so background
 * music survives scene changes and scene restarts. Web Audio stays locked
 * until the first user gesture, therefore a requested track is parked until
 * the sound manager reports that it is unlocked.
 */
export class AudioManager {
  private static shared: AudioManager | null = null;
  private readonly voices = new Map<string, Voice[]>();
  private readonly lastActionAt = new Map<ClassSfxId, number>();
  private bgm: Voice | null = null;
  private bgmKey = '';
  private bgmVolume = 0.5;
  private pendingBgm: string | null = null;
  private muted = false;
  private unlocked = false;

  private constructor(private readonly game: Phaser.Game) {
    this.unlocked = !(game.sound as { locked?: boolean }).locked;
    game.sound.on(Phaser.Sound.Events.UNLOCKED, this.onUnlocked, this);
  }

  /** Creates the shared manager. Safe to call more than once. */
  static boot(game: Phaser.Game): AudioManager {
    if (!this.shared) this.shared = new AudioManager(game);
    return this.shared;
  }

  /** The shared manager, or null when the game booted without audio. */
  static get audio(): AudioManager | null {
    return this.shared;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get currentBgm(): string {
    return this.bgmKey;
  }

  /** Starts a looping track, replacing whatever is playing. */
  playBgm(id: BgmId, volume = 0.5): void {
    const key = BGM_FILES[id];
    if (!key) return;
    if (this.bgmKey === key && this.bgm?.isPlaying) {
      this.bgmVolume = volume;
      this.bgm.setVolume?.(volume);
      return;
    }
    this.pendingBgm = key;
    this.bgmVolume = volume;
    if (!this.unlocked) return;
    this.startPendingBgm();
  }

  /** Fades the music out and frees the loop. */
  stopBgm(): void {
    this.pendingBgm = null;
    this.bgmKey = '';
    if (!this.bgm) return;
    this.bgm.stop();
    this.bgm.destroy();
    this.bgm = null;
  }

  /** Pauses or resumes the music without losing the current track. */
  setBgmPaused(paused: boolean): void {
    if (!this.bgm) return;
    if (paused) {
      if (this.bgm.isPlaying) this.bgm.pause();
    } else if (this.bgm.isPaused) {
      this.bgm.resume();
    }
  }

  /** Plays a one-shot effect, reusing a free voice of that effect. */
  sfx(id: SfxId, volume = 1, rate = 1): void {
    if (this.muted) return;
    const key = SFX_FILES[id];
    if (!key) return;
    const pool = this.voices.get(key) ?? [];
    if (!pool.length) {
      for (let i = 0; i < VOICES_PER_EFFECT; i++) {
        const voice = this.game.sound.add(key, { volume, rate }) as Voice | null;
        if (voice) pool.push(voice);
      }
      if (!pool.length) return;
      this.voices.set(key, pool);
    }
    const voice = pool.find(item => !item.isPlaying) ?? pool[0];
    voice.setVolume?.(volume);
    voice.setRate?.(rate);
    voice.play();
  }

  /** Class action effects use the SFX pool and their own level, independent of BGM. */
  action(classId: ClassId, action: ClassAction, volume = 0.72): void {
    if (this.muted) return;
    const id: ClassSfxId = `${classId}-${action}`;
    const now = this.game.loop.now;
    // A multi-projectile attack or repeated guard contact still makes one cue.
    if (now - (this.lastActionAt.get(id) ?? -Infinity) < 45) return;
    this.lastActionAt.set(id, now);
    this.sfx(id, volume);
  }

  /** Mutes or restores every sound of the game. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.game.sound.mute = muted;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private onUnlocked(): void {
    this.unlocked = true;
    this.startPendingBgm();
  }

  private startPendingBgm(): void {
    const key = this.pendingBgm;
    if (!key) return;
    this.pendingBgm = null;
    if (this.bgm) {
      this.bgm.stop();
      this.bgm.destroy();
      this.bgm = null;
    }
    const sound = this.game.sound.add(key, { loop: true, volume: this.bgmVolume }) as Voice | null;
    if (!sound) return;
    sound.play();
    this.bgm = sound;
    this.bgmKey = key;
  }
}
