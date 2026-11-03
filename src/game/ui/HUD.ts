import { THEME } from '../theme';
import { CLASSES, CLASS_IDS, UPGRADE_RULES, CAMPAIGN, BOSSES, type ClassId, type HUDState, type RunStats } from '../config';
import type { UpgradeChoice } from '../systems/UpgradeSystem';
import type { AudioManager } from '../systems/AudioManager';
import { getPreferences, setPreference, type TouchLayout } from '../systems/Preferences';
import { readRecords, type RecordMode } from '../systems/RunRecords';
import './hud.css';

interface HUDCallbacks {
  onStart: (classId: ClassId, runMode?: RecordMode) => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onUpgrade: (id: string) => void;
  onClaimReward: () => void;
}

type Screen = 'menu' | 'game' | 'pause' | 'upgrade' | 'death' | 'reward';
interface AutoUpgradeNotice { choice: UpgradeChoice; count: number; repeats: number; }

const escape = (value: string | number): string => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const duration = (seconds: number): string => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

/** DOM overlays stay independent from game simulation and share a single callback boundary. */
export class HUD {
  private readonly root: HTMLDivElement;
  private readonly game: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly toastElement: HTMLDivElement;
  private readonly barrageLanes: HTMLDivElement[];
  private readonly barrageActive = [false];
  private readonly barrageQueue = new Map<string, AutoUpgradeNotice>();
  private screen: Screen = 'menu';
  private selectedClass: ClassId = 'warrior';
  private selectedMode: RecordMode = 'campaign';
  private buildInfo: string[] = [];
  private state?: HUDState;
  private choices: UpgradeChoice[] = [];
  private toastTimer?: ReturnType<typeof setTimeout>;
  private readonly cached = new Map<string, string>();
  private readonly elements: Record<string, HTMLElement> = {};

  constructor(private readonly callbacks: HUDCallbacks, private readonly audio:AudioManager|null=null) {
    this.root = document.createElement('div');
    this.root.className = 'lumen-ui';
    this.root.setAttribute('aria-label', `${THEME.title}游戏界面`);
    this.root.innerHTML = `
      <div class="lumen-hud" hidden>
        <div class="hud-topline">
          <div class="hero-panel">
            <div class="hero-sigil hero-portrait" aria-hidden="true"><i></i><img class="hero-portrait-art" src="./assets/hero/portrait.png" alt="" decoding="async"></div>
            <div class="health-panel">
              <div class="health-heading"><span>奶蛙 <small data-field="className">${CLASSES.warrior.name} · ${CLASSES.warrior.weapon}</small></span><b data-field="health">100 / 100</b></div>
              <div class="health-track"><div class="health-fill" data-field="healthFill"></div><i></i><i></i><i></i></div>
              <div class="run-meta"><span data-field="seed">RUN —</span><span data-field="elapsed">00:00</span><span data-field="kills">0 回收</span></div>
            </div>
          </div>
          <div class="stage-panel"><span class="eyebrow">${escape(THEME.arenaEnglish)}</span><div><b data-field="wave">第 01 波</b><span class="stage-divider"></span><span data-field="remaining">回收噪声</span></div></div>
          <button class="pause-button" type="button" data-testid="pause" aria-label="暂停游戏"><span aria-hidden="true">Ⅱ</span><small>ESC</small></button>
        </div>
        <div class="boss-panel" data-field="bossPanel" data-testid="boss-health" role="meter" aria-label="首领生命" aria-valuemin="0" hidden><div class="boss-heading"><span data-field="bossName"></span><small data-field="bossPhase"></small><b data-field="bossHealth"></b></div><div class="boss-track"><i data-field="bossFill"></i></div><div class="toughness-heading"><span data-field="bossToughnessLabel">韧性</span><b data-field="bossToughness"></b></div><div class="toughness-track" data-testid="boss-toughness"><i data-field="bossToughnessFill"></i></div></div>
        <div class="stage-objective" data-field="status">击退噪声，回收笑点</div>
        <div class="target-readout"><span data-field="targetName">自动索敌 · 搜寻目标</span><span class="ultimate-status" data-field="ultimateStatus">终结蓄能 0%</span></div>
        <div class="combo-notice" data-field="combo" hidden></div>
        <div class="hud-bottomline">
          <div class="ability-readout"><div class="ability-key"><kbd>J</kbd><span data-field="attackName">攻击</span><i data-field="attackFill"></i></div><div class="ability-key"><kbd>K</kbd><span>冲刺</span><i data-field="dashFill"></i></div><div class="ability-key guard-key"><kbd>SPACE / L</kbd><span data-field="guardStatus">格挡</span><i data-field="guardFill"></i></div><div class="ability-key ultimate-key" data-field="ultimateKey"><kbd>Q / I</kbd><span data-field="ultimateName">终结</span><i data-field="ultimateFill"></i></div></div>
          <div class="ember-progress"><div><span><i>✦</i> 笑点共鸣</span><b data-field="progress">0 / 5</b></div><div class="ember-track"><i data-field="progressFill"></i></div><small class="upgrade-mode" data-field="upgradeMode">手选 0/10</small></div>
          <div class="desktop-hint"><span><kbd>WASD / ↑↓←→</kbd> 全向移动</span><span>攻击自动瞄准最近敌人</span></div>
        </div>
      </div>
      <button class="sound-button" type="button" data-testid="sound" aria-label="关闭音效" aria-pressed="true"><span aria-hidden="true">♪</span></button>
      <div class="auto-upgrade-barrage" data-testid="auto-upgrade-barrage" role="log" aria-label="自动获得的加成" aria-live="polite" aria-relevant="additions text"><div class="auto-upgrade-lane" hidden><span class="auto-upgrade-message"></span></div></div>
      <div class="lumen-overlay"></div>
      <div class="lumen-toast" role="status" hidden></div>`;
    (document.querySelector('#game-shell') ?? document.body).appendChild(this.root);
    this.game = this.root.querySelector('.lumen-hud')!;
    this.overlay = this.root.querySelector('.lumen-overlay')!;
    this.toastElement = this.root.querySelector('.lumen-toast')!;
    this.barrageLanes = Array.from(this.root.querySelectorAll<HTMLDivElement>('.auto-upgrade-lane'));
    this.barrageLanes.forEach((lane, index) => {
      lane.firstElementChild!.addEventListener('animationend', () => this.finishAutoUpgrade(index));
    });
    this.root.querySelectorAll<HTMLElement>('[data-field]').forEach((element) => {
      this.elements[element.dataset.field!] = element;
    });
    const portrait = this.root.querySelector<HTMLImageElement>('.hero-portrait-art')!;
    const showPortrait = (): void => { portrait.parentElement?.classList.add('portrait-ready'); };
    portrait.addEventListener('load', showPortrait, { once: true });
    if (portrait.complete && portrait.naturalWidth > 0) showPortrait();
    this.root.querySelector('[data-testid="pause"]')!.addEventListener('click', callbacks.onPause);
    const sound=this.root.querySelector<HTMLButtonElement>('[data-testid="sound"]')!;
    sound.addEventListener('click',()=>this.toggleSound());
    if(!this.audio)sound.hidden=true;
    // A new scene reuses the shared manager, so the button mirrors the stored mute state.
    this.applySoundState(this.audio?.isMuted??false);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('naiwasettingschange', this.applyPreferences);
    this.applyPreferences();
    this.showMenu();
  }

  /** Mutes every sound of the run and keeps the button state in sync. */
  private toggleSound():void {
    const muted=this.audio?this.audio.toggleMuted():false;
    this.applySoundState(muted);
    if(!muted)this.audio?.sfx('ui',.8);
  }

  private applySoundState(muted:boolean):void {
    const button=this.root.querySelector<HTMLButtonElement>('[data-testid="sound"]')!;
    button.classList.toggle('is-muted',muted);
    button.setAttribute('aria-pressed',String(!muted));
    button.setAttribute('aria-label',muted?'开启音效':'关闭音效');
    button.firstElementChild!.textContent=muted?'✕':'♪';
  }

  update(state: HUDState): void {
    this.state = state;
    this.text('health', `${Math.max(0, Math.ceil(state.health))} / ${state.maxHealth}`);
    this.style('healthFill', 'width', `${Math.max(0, Math.min(100, state.health / state.maxHealth * 100)).toFixed(1)}%`);
    const critical = state.health > 0 && state.health / state.maxHealth < 0.3;
    if (this.game.classList.contains('health-critical') !== critical) this.game.classList.toggle('health-critical', critical);
    this.text('wave', `第 ${String(state.wave).padStart(2, '0')} / ${state.waveCap} 波`);
    const boss = state.boss && state.boss.health > 0 ? state.boss : null;
    this.elements.bossPanel.hidden = !boss;
    this.root.classList.toggle('has-boss', !!boss);
    if (boss) {
      this.text('bossName', boss.name);
      this.text('bossPhase', `阶段 ${Math.max(1, boss.phase)}`);
      this.text('bossHealth', `${Math.max(0, Math.ceil(boss.health))} / ${boss.maxHealth}`);
      this.style('bossFill', 'width', `${Math.min(100, Math.max(0, boss.health / Math.max(1, boss.maxHealth) * 100)).toFixed(1)}%`);
      this.elements.bossPanel.setAttribute('aria-valuemax', String(boss.maxHealth));
      this.elements.bossPanel.setAttribute('aria-valuenow', String(Math.max(0, Math.ceil(boss.health))));
      this.elements.bossPanel.setAttribute('aria-label', `${boss.name}，阶段 ${Math.max(1, boss.phase)}`);
      const toughness = boss as typeof boss & { toughness?: number; maxToughness?: number; broken?: boolean };
      this.text('bossToughnessLabel', toughness.broken ? '破防 · 伤害提高' : '韧性 · 完美格挡可削减');
      this.text('bossToughness', `${Math.ceil(toughness.toughness ?? 0)} / ${toughness.maxToughness ?? 100}`);
      this.style('bossToughnessFill', 'width', `${Math.min(100, Math.max(0, (toughness.toughness ?? 0) / Math.max(1, toughness.maxToughness ?? 100) * 100))}%`);
      this.elements.bossPanel.classList.toggle('is-broken', !!toughness.broken);
    }
    this.text('remaining', state.remaining > 0 ? `${state.remaining} 个敌人` : '本层回收完成');
    this.text('seed', `RUN ${state.seed}`);
    this.text('elapsed', duration(state.elapsed));
    this.text('kills', `${state.kills} 回收`);
    this.text('status', state.status);
    this.text('className', `${state.className} · ${state.weaponName}`);
    this.text('attackName', CLASSES[state.classId].attackName);
    this.text('targetName', state.targetName ? `自动索敌 · ${state.targetName}` : '自动索敌 · 搜寻目标');
    this.text('guardStatus', state.guardActive ? '格挡中' : '格挡');
    this.text('ultimateName', state.ultimateName);
    this.text('ultimateStatus', state.ultimateReady ? `${state.ultimateName} · 已就绪` : state.ultimateCharge>=100 ? '终结冷却中' : `终结蓄能 ${Math.floor(state.ultimateCharge)}%`);
    this.style('guardFill', 'transform', `scaleX(${(1 - Math.min(1, Math.max(0, state.guardRatio))).toFixed(2)})`);
    this.style('ultimateFill', 'transform', `scaleX(${Math.min(1, Math.max(0, state.ultimateCharge / 100)).toFixed(2)})`);
    this.elements.ultimateKey.classList.toggle('is-ready', state.ultimateReady);
    this.game.classList.toggle('is-guarding', state.guardActive);
    this.text('progress', state.upgradesExhausted ? 'MAX' : `${Math.min(state.progress, state.nextUpgrade)} / ${state.nextUpgrade}`);
    this.text('upgradeMode', state.upgradesExhausted ? `增益已满 · 已获 ${state.upgrades}` : state.autoUpgrades ? `自动加成 · 已获 ${state.upgrades}` : `手选 ${state.upgrades}/${UPGRADE_RULES.manualChoices}${state.pendingUpgrades > 0 ? ` · 波末待选 ${state.pendingUpgrades}` : ''}`);
    this.elements.upgradeMode.classList.toggle('is-exhausted', state.upgradesExhausted);
    this.elements.upgradeMode.classList.toggle('is-automatic', state.autoUpgrades);
    this.style('progressFill', 'width', state.upgradesExhausted ? '100%' : `${Math.min(100, state.progress / Math.max(1, state.nextUpgrade) * 100).toFixed(1)}%`);
    this.style('dashFill', 'transform', `scaleX(${(1 - Math.min(1, Math.max(0, state.dashRatio))).toFixed(2)})`);
    this.style('attackFill', 'transform', `scaleX(${(1 - Math.min(1, Math.max(0, state.attackRatio))).toFixed(2)})`);
    if (this.elements.combo.hidden !== (state.combo < 2)) this.elements.combo.hidden = state.combo < 2;
    this.text('combo', `${state.combo} 连击`);
  }

  showMenu(selectedClass: ClassId = 'warrior', selectedMode: RecordMode = this.selectedMode): void {
    this.selectedClass = selectedClass;
    this.selectedMode = selectedMode;
    this.setScreen('menu');
    this.overlay.innerHTML = `
      <div class="menu-screen">
        <div class="menu-top"><span class="wordmark">${escape(THEME.englishTitle)}</span><span class="build-label"><span class="build-format">2.5D ACTION ROGUELITE <i></i></span> DEMO 1.0.0</span></div>
        <div class="menu-main"><div class="menu-content">
          <div class="menu-kicker"><span></span> 快乐缓存，正在重启</div>
          <h1>奶<span>蛙</span><i>☺</i></h1><div class="menu-subtitle">${escape(THEME.subtitle)}</div>
          <p class="menu-description menu-tagline">快乐缓存掉线了。带上奶香，把笑点找回来。</p>
          <div class="mode-picker" role="group" aria-label="选择游戏模式"><button type="button" data-mode="campaign" data-testid="mode-campaign" aria-pressed="${this.selectedMode === 'campaign'}"><b>完整战役</b><small>50 波 · 五章冒险</small></button><button type="button" data-mode="quick" data-testid="mode-quick" aria-pressed="${this.selectedMode === 'quick'}"><b>快速挑战</b><small>10 波 · 随机首领</small></button></div>
          <ol class="menu-route" aria-label="${CAMPAIGN.maxWaves} 层快乐回收路线">${CAMPAIGN.bossWaves.map(wave => `<li><b>${wave}</b><span>${escape(BOSSES[wave].name)}</span></li>`).join('')}</ol>
          <button class="primary-button start-button" type="button" data-testid="start"><span>出发回收快乐</span><span class="button-arrow">↗</span></button>
          <p class="menu-run-note"><span>●</span> <span class="selected-record" data-testid="selected-record"></span></p>
        </div>
        <section class="class-picker" aria-label="选择职业路线">
          <div class="class-picker-heading"><div><span class="eyebrow">HAPPY LOADOUT</span><h2>选择职业路线</h2></div><span>三条独立成长路线</span></div>
          <div class="class-cards">${CLASS_IDS.map(id => {
            const c = CLASSES[id];
            const finisher = id === 'warrior' ? '终结：近身三段回旋' : id === 'mage' ? '终结：定点奶泡轰击' : '终结：追踪穿透齐射';
            return `<button class="class-card" type="button" data-testid="class-${id}" data-class="${id}" aria-pressed="${id === selectedClass}" style="--route-color:#${c.color.toString(16).padStart(6, '0')}"><span class="class-card-top"><i aria-hidden="true">${c.icon}</i><b>${c.name}</b><span class="class-check" aria-hidden="true">✓</span></span><span class="class-weapon">${c.weapon}</span><span class="class-role">${c.role}</span><span class="class-base-stats"><span>生命 <b>${c.stats.maxHealth}</b></span><span>攻击 <b>${c.stats.damage}</b></span></span><span class="class-mini-ultimate">${finisher}</span></button>`;
          }).join('')}</div>
          <div class="class-summary"><img src="./assets/hero/portrait.png" alt="奶蛙" decoding="async"><div><b class="class-selected-name"></b><p class="class-route-description"></p></div></div>
          <div class="class-ultimate-description"></div>
          <details class="menu-details"><summary>故事、操作与本地记录</summary><div class="menu-details-content"><p class="menu-story" data-testid="story">${escape(THEME.story)}</p><p>左侧 1/3 拖动移动；按住攻击自动瞄准可命中目标。冲刺躲弹幕，格挡出手瞬间触发完美格挡。击中与精准格挡积攒终结能量。</p><p>每 10 波击败首领，选择核心改造。暂停可查看当前构筑、效果选项和触控布局。</p><div class="menu-records" data-testid="local-records">${this.recordsMarkup()}</div></div></details>
        </section></div>
        <div class="menu-bottom"><div class="keyboard-help"><span><kbd>WASD</kbd><kbd>↑↓←→</kbd> 移动</span><span><kbd>J</kbd> 攻击</span><span><kbd>K</kbd> 冲刺</span><span><kbd>SPACE / L</kbd> 格挡</span><span><kbd>Q / I</kbd> 终结</span><span><kbd>ESC</kbd> 暂停</span></div><div class="touch-help">左侧拖动移动 · 按住攻击 · 精准格挡削减首领韧性</div></div>
      </div>`;
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-class]').forEach(button => {
      button.addEventListener('click', () => {
        this.click();
        this.selectedClass = button.dataset.class as ClassId;
        this.updateClassSelection();
      });
    });
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => {
      this.click(); this.selectedMode = button.dataset.mode as RecordMode;
      this.overlay.querySelectorAll('[data-mode]').forEach(option => option.setAttribute('aria-pressed', String((option as HTMLElement).dataset.mode === this.selectedMode)));
      this.updateClassSelection();
    }));
    this.updateClassSelection();
    this.bind('start', () => this.callbacks.onStart(this.selectedClass, this.selectedMode));
  }

  private updateClassSelection(): void {
    const c = CLASSES[this.selectedClass];
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-class]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.class === this.selectedClass));
    });
    const summary = this.overlay.querySelector<HTMLElement>('.class-summary')!;
    summary.style.setProperty('--route-color', `#${c.color.toString(16).padStart(6, '0')}`);
    this.overlay.querySelector('.class-selected-name')!.textContent = `${c.name} · ${c.weapon}`;
    this.overlay.querySelector('.class-route-description')!.textContent = c.description;
    this.overlay.querySelector('.class-ultimate-description')!.innerHTML = `<span>终结 · ${escape(c.ultimateName)}</span><p>${escape(c.ultimateDescription)}</p>`;
    this.overlay.querySelector('[data-testid="start"]>span')!.textContent = `以${c.name}出发`;
    const record = readRecords()[this.selectedMode][this.selectedClass];
    this.overlay.querySelector('.selected-record')!.textContent = `${this.selectedMode === 'quick' ? '快局' : '战役'}最高 ${record.highestWave}/${this.selectedMode === 'quick' ? 10 : 50} 波${record.fastestWin === null ? ' · 新的快乐在等你' : ` · 最快 ${duration(record.fastestWin)}`}`;
  }

  showGame(): void {
    this.setScreen('game');
    this.overlay.replaceChildren();
  }

  setBuildInfo(summary: string[]): void {
    this.buildInfo = summary.slice(0, 24);
  }

  private recordsMarkup(): string {
    const records = readRecords();
    return (['campaign', 'quick'] as const).map(mode => `<section><b>${mode === 'quick' ? '10 波快速挑战' : '50 波完整战役'}</b>${CLASS_IDS.map(id => {
      const record = records[mode][id];
      return `<p>${escape(CLASSES[id].name)} · 最高 ${record.highestWave} 波 · 连击 ${record.bestCombo} · 回收 ${record.mostKills}${record.fastestWin === null ? '' : ` · 最快 ${duration(record.fastestWin)}`}</p>`;
    }).join('')}</section>`).join('');
  }

  private readonly applyPreferences = (): void => {
    this.root.classList.toggle('reduced-motion', getPreferences().reducedMotion);
  };

  showPause(): void {
    this.setScreen('pause');
    const s = this.state;
    this.overlay.innerHTML = `
      <section class="dialog pause-dialog" role="dialog" aria-modal="true" aria-label="游戏已暂停"><div class="dialog-overline">TAKE A MILK BREAK</div><h2>喝口奶，歇一下<span>Ⅱ</span></h2><p class="dialog-subtitle">${escape(s?.className ?? CLASSES[this.selectedClass].name)} · ${escape(s?.weaponName ?? CLASSES[this.selectedClass].weapon)} · 优先锁定可命中目标</p>
        <div class="pause-stats"><span>攻击 <b>${s?.damage ?? 26}</b></span><span>暴击 <b>${Math.round((s?.critChance ?? 0.08) * 100)}%</b></span><span>移速 <b>${Math.round(s?.speed ?? 270)}</b></span><span>闪掠 <b>${((s?.dashCooldown ?? 1450) / 1000).toFixed(2)}s</b></span><span>${s?.upgradesExhausted ? '增益已满' : s?.autoUpgrades ? '自动加成' : '波末手选'}<b>${s?.upgrades ?? 0}${s?.autoUpgrades ? '' : `/${UPGRADE_RULES.manualChoices}`}</b></span></div>
        <div class="pause-scroll"><section class="build-summary" data-testid="build-summary"><h3>当前构筑</h3>${this.buildInfo.length ? `<ul>${this.buildInfo.map(line => `<li>${escape(line)}</li>`).join('')}</ul>` : '<p>尚未获得核心改造。前期选择加成，首领胜利后确定流派。</p>'}</section><fieldset class="preferences"><legend>舒适度与触控</legend><label><input type="checkbox" data-testid="setting-shake" ${getPreferences().reducedShake ? 'checked' : ''}>降低屏幕震动</label><label><input type="checkbox" data-testid="setting-motion" ${getPreferences().reducedMotion ? 'checked' : ''}>减少动态效果</label><label>右侧按键布局<select data-testid="setting-layout"><option value="arc" ${getPreferences().touchLayout === 'arc' ? 'selected' : ''}>舒展弧形</option><option value="compact" ${getPreferences().touchLayout === 'compact' ? 'selected' : ''}>紧凑拇指</option></select></label></fieldset><details class="pause-details"><summary>操作说明与本局数据</summary><p class="pause-skill-help">普通格挡安全减伤；出手瞬间完美格挡免伤、强化反击并补充终结能量。精准格挡与技能削减首领韧性，破防时集中输出。<br>按住攻击自动索敌；冲刺沿移动方向，静止时沿朝向。终结就绪时主动释放。</p><p>RUN ${escape(s?.seed ?? '—')} · 用时 ${duration(s?.elapsed ?? 0)} · 回收 ${s?.kills ?? 0} · 当前连击 ${s?.combo ?? 0}</p></details></div>
        <button class="primary-button" type="button" data-testid="resume"><span>继续回收</span><span class="button-arrow">→</span></button>
        <div class="dialog-secondary"><button type="button" data-testid="restart">重新开始</button><button type="button" data-testid="menu">返回主菜单</button></div><div class="dialog-keyhint">${matchMedia('(pointer: coarse)').matches ? '点击「继续回收」返回战斗' : '按 ESC 或 ENTER 继续'}</div>
      </section>`;
    this.bind('resume', this.callbacks.onResume);
    this.bind('restart', this.callbacks.onRestart);
    this.bind('menu', this.callbacks.onMenu);
    this.overlay.querySelector<HTMLInputElement>('[data-testid="setting-shake"]')!.addEventListener('change', event => setPreference('reducedShake', (event.target as HTMLInputElement).checked));
    this.overlay.querySelector<HTMLInputElement>('[data-testid="setting-motion"]')!.addEventListener('change', event => setPreference('reducedMotion', (event.target as HTMLInputElement).checked));
    this.overlay.querySelector<HTMLSelectElement>('[data-testid="setting-layout"]')!.addEventListener('change', event => setPreference('touchLayout', (event.target as HTMLSelectElement).value as TouchLayout));
    this.focus('resume');
  }

  showUpgrade(choices: UpgradeChoice[]): void {
    this.choices = choices;
    this.setScreen('upgrade');
    const details = choices as (UpgradeChoice & { category?: string; rarity?: string; maxLevel?: number })[];
    const core = details.some(choice => choice.category === 'core');
    this.overlay.innerHTML = `
      <section class="upgrade-dialog ${core ? 'core-dialog' : ''}" role="dialog" aria-modal="true" aria-label="选择升级"><div class="dialog-overline"><span>✦</span> ${core ? 'CORE REMIX' : 'HAPPY RESONANCE'}</div><h2>${core ? '快乐新路线 · 核心改造' : '波末结算 · 快乐加成'}</h2><p class="dialog-subtitle">${escape(this.state?.className ?? CLASSES[this.selectedClass].name)}路线 · ${core ? '选择战斗方式，构筑由你决定' : `前期手选 · 已获 ${this.state?.upgrades ?? 0} 项加成`}<span class="upgrade-paused">时间已暂停</span></p>
        <div class="upgrade-cards" style="grid-template-columns:repeat(${Math.max(1, choices.length)},minmax(0,1fr))">${details.map((choice, index) => `<button type="button" class="upgrade-card ${choice.category === 'core' ? 'is-core' : ''}" data-category="${escape(choice.category ?? 'basic')}" data-rarity="${escape(choice.rarity ?? 'common')}" data-testid="upgrade-${escape(choice.id)}" data-upgrade-index="${index}"><div class="card-topline"><span>${choice.category === 'core' ? '✦ 核心改造' : choice.rarity === 'rare' ? '稀有 · ' : '基础 · '}${escape(choice.tag)}</span><kbd>${index + 1}</kbd></div><div class="upgrade-icon" aria-hidden="true">${escape(choice.icon)}</div><span class="upgrade-name">${escape(choice.name)}</span><span class="upgrade-description">${escape(choice.description)}</span><div class="card-bottomline"><span>LV. ${Math.max(0, choice.level - 1)} <i>→</i> ${choice.level} <em>/ ${choice.maxLevel ?? UPGRADE_RULES.maxPerUpgrade}</em></span><b>${choice.category === 'core' ? '改造职业' : '领取加成'} ↗</b></div></button>`).join('')}</div>
        <div class="dialog-keyhint">基础加成有上限 · 核心与进阶选择持续出现 <span>·</span> 点击卡片${matchMedia('(pointer: fine)').matches ? '或按 1 / 2 / 3' : '选择'}</div>
      </section>`;
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-upgrade-index]').forEach((button) => {
      button.addEventListener('click', () => this.choose(Number(button.dataset.upgradeIndex)));
    });
  }

  showDeath(stats: RunStats): void {
    this.setScreen('death');
    this.overlay.innerHTML = `
      <section class="dialog death-dialog" role="dialog" aria-modal="true" aria-label="本次回收结算"><div class="death-symbol" aria-hidden="true">◌<i>◡</i></div><div class="dialog-overline">TAKE A SIP, TRY AGAIN</div><h2>不急，再蛙一次</h2><p class="dialog-subtitle">${escape(CLASSES[stats.classId].name)} · ${escape(CLASSES[stats.classId].weapon)} · 喝口奶，再把快乐带回来。</p>
        <div class="death-stats"><div><span>抵达层数</span><b>${stats.wave.toString().padStart(2, '0')}<small>FLOOR</small></b></div><div><span>回收噪声</span><b>${stats.kills}<small>RECYCLED</small></b></div><div><span>存活时间</span><b>${duration(stats.elapsed)}<small>TIME</small></b></div><div><span>快乐加成</span><b>${stats.upgrades}<small>BOOSTS</small></b></div></div>
        <div class="death-run-details"><span>最高连击 <b>${stats.bestCombo}</b></span><span>RUN ${escape(stats.seed)}</span></div><p class="result-record" data-testid="result-record">${this.resultRecord(stats)}</p>
        <button class="primary-button" type="button" data-testid="restart"><span>再蛙一次</span><span class="button-arrow">↻</span></button><button class="text-button" type="button" data-testid="menu">返回主菜单</button>
      </section>`;
    this.bind('restart', this.callbacks.onRestart);
    this.bind('menu', this.callbacks.onMenu);
    this.focus('restart');
  }

  /** The first state leaves the room and movement visible; claiming opens the final run result. */
  showRewardRoom(stats: RunStats, claimed: boolean): void {
    this.setScreen('reward');
    this.root.classList.toggle('reward-claimed', claimed);
    const className = CLASSES[stats.classId].name;
    const quick = (stats as RunStats & { mode?: RecordMode }).mode === 'quick';
    const cap = quick ? 10 : CAMPAIGN.maxWaves;
    if (!claimed) {
      this.overlay.innerHTML = `
        <section class="reward-room-hud" aria-label="通关奖励房" data-testid="reward-room">
          <div class="reward-room-banner"><span class="dialog-overline">HAPPINESS RESTORED</span><h2>${cap} 层通关 · ${escape(THEME.rewardRoom)}</h2><p>${quick ? '快速挑战首领已回收' : `${CAMPAIGN.bossWaves.join(' / ')} 层首领已回收`}<span> · ${escape(className)} · ${duration(stats.elapsed)}</span></p></div>
          <div class="reward-room-actions"><p>走近宝箱，或点击下方领取通关奖章</p><button class="primary-button" type="button" data-testid="claim-reward"><span>领取通关奖章</span><span class="button-arrow">✦</span></button><div class="reward-room-exits"><button type="button" data-testid="restart">重新挑战</button><button type="button" data-testid="menu">返回主菜单</button></div></div>
        </section>`;
      this.bind('claim-reward', this.callbacks.onClaimReward);
    } else {
      this.overlay.innerHTML = `
        <section class="dialog victory-dialog" role="dialog" aria-modal="true" aria-label="通关结算" data-testid="victory">
          <div class="dialog-overline">${cap} / ${cap} · HAPPY REBOOT</div><h2>蛙友，重新连线！<span>✦</span></h2><p class="dialog-subtitle">${escape(className)} · ${escape(CLASSES[stats.classId].weapon)} · ${cap} 层快乐回收完成</p>
          <div class="victory-medal" data-testid="run-medal"><i aria-hidden="true">✦</i><div><b>${escape(THEME.medal)}</b><span>本局通关奖章</span></div><button type="button" data-testid="claim-reward" disabled>奖励已领取 ✓</button></div>
          <div class="death-stats"><div><span>完成关卡</span><b>${cap}<small>STAGES</small></b></div><div><span>回收噪声</span><b>${stats.kills}<small>RECYCLED</small></b></div><div><span>通关时间</span><b>${duration(stats.elapsed)}<small>TIME</small></b></div><div><span>快乐加成</span><b>${stats.upgrades}<small>BOOSTS</small></b></div></div>
          <div class="death-run-details"><span>最高连击 <b>${stats.bestCombo}</b></span><span>RUN ${escape(stats.seed)}</span></div><p class="result-record" data-testid="result-record">${this.resultRecord(stats)}</p>
          <div class="victory-actions"><button class="primary-button" type="button" data-testid="restart"><span>再来一局</span><span class="button-arrow">↻</span></button><button class="secondary-button" type="button" data-testid="menu">返回主菜单</button></div>
        </section>`;
      this.focus('restart');
    }
    this.bind('restart', this.callbacks.onRestart);
    this.bind('menu', this.callbacks.onMenu);
  }

  private resultRecord(stats: RunStats): string {
    const mode = (stats as RunStats & { mode?: RecordMode }).mode === 'quick' ? 'quick' : 'campaign';
    const record = readRecords()[mode][stats.classId];
    return `${mode === 'quick' ? '快局' : '战役'}纪录 · 最高 ${record.highestWave} 波 · 连击 ${record.bestCombo}${record.fastestWin === null ? '' : ` · 最快 ${duration(record.fastestWin)}`}`;
  }

  /** One compact, stationary reward notice never steals input or pauses the simulation. */
  announceAutoUpgrade(choice: UpgradeChoice, count: number): void {
    if (this.screen === 'menu' || this.screen === 'death' || this.screen === 'reward') return;
    const free = this.barrageActive.indexOf(false);
    const notice: AutoUpgradeNotice = { choice: { ...choice }, count, repeats: 1 };
    if (free >= 0) {
      this.startAutoUpgrade(free, notice);
      return;
    }
    const queued = this.barrageQueue.get(choice.id);
    if (queued) notice.repeats += queued.repeats;
    // There are nine possible upgrades per route. This cap also bounds unknown future IDs.
    if (!queued && this.barrageQueue.size >= 12) this.barrageQueue.delete(this.barrageQueue.keys().next().value!);
    this.barrageQueue.set(choice.id, notice);
  }

  private startAutoUpgrade(index: number, notice: AutoUpgradeNotice): void {
    const lane = this.barrageLanes[index];
    const message = lane.firstElementChild as HTMLSpanElement;
    this.barrageActive[index] = true;
    lane.hidden = false;
    lane.dataset.upgradeId = notice.choice.id;
    lane.dataset.upgradeCount = String(notice.count);
    lane.dataset.upgradeOccurrences = String(notice.repeats);
    const merged = notice.repeats > 1 ? ` · ×${notice.repeats}` : '';
    message.innerHTML = `<b aria-hidden="true">${escape(notice.choice.icon)}</b><strong>${escape(notice.choice.name)} <small>LV.${notice.choice.level}${merged}</small></strong><span>${escape(notice.choice.description)}</span>`;
    lane.style.setProperty('--barrage-width', `${lane.clientWidth}px`);
    lane.style.setProperty('--barrage-duration', '2.8s');
    message.classList.add('is-scrolling');
  }

  private finishAutoUpgrade(index: number): void {
    const lane = this.barrageLanes[index];
    const message = lane.firstElementChild as HTMLSpanElement;
    message.classList.remove('is-scrolling');
    message.replaceChildren();
    lane.hidden = true;
    delete lane.dataset.upgradeId;
    delete lane.dataset.upgradeCount;
    delete lane.dataset.upgradeOccurrences;
    this.barrageActive[index] = false;
    const next = this.barrageQueue.entries().next().value;
    if (next) {
      this.barrageQueue.delete(next[0]);
      // startAutoUpgrade measures the lane after the old class is removed, restarting CSS cleanly.
      if (this.screen !== 'menu' && this.screen !== 'death' && this.screen !== 'reward') this.startAutoUpgrade(index, next[1]);
    }
  }

  private clearAutoUpgrades(): void {
    this.barrageQueue.clear();
    this.barrageLanes.forEach((lane, index) => {
      (lane.firstElementChild as HTMLElement).classList.remove('is-scrolling');
      lane.firstElementChild!.replaceChildren();
      lane.hidden = true;
      delete lane.dataset.upgradeId;
      delete lane.dataset.upgradeCount;
      delete lane.dataset.upgradeOccurrences;
      this.barrageActive[index] = false;
    });
  }

  toast(message: string, subtext?: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastElement.innerHTML = `<span class="toast-ornament">✦</span><div><b>${escape(message)}</b>${subtext ? `<small>${escape(subtext)}</small>` : ''}</div>`;
    this.toastElement.hidden = false;
    this.root.classList.add('has-toast');
    this.toastElement.classList.remove('toast-enter');
    void this.toastElement.offsetWidth;
    this.toastElement.classList.add('toast-enter');
    this.toastTimer = setTimeout(() => {
      this.toastElement.hidden = true;
      this.root.classList.remove('has-toast');
    }, 2700);
  }

  destroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.clearAutoUpgrades();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('naiwasettingschange', this.applyPreferences);
    this.root.remove();
  }

  private setScreen(screen: Screen): void {
    if (screen === 'menu' || screen === 'death' || screen === 'reward') this.clearAutoUpgrades();
    if (screen !== 'reward') this.root.classList.remove('reward-claimed');
    this.screen = screen;
    this.root.dataset.screen = screen;
    this.game.hidden = screen === 'menu' || screen === 'death' || screen === 'reward';
    this.overlay.hidden = screen === 'game';
    if (screen !== 'game') {
      this.toastElement.hidden = true;
      this.root.classList.remove('has-toast');
    }
  }

  private bind(testId: string, callback: () => void): void {
    this.overlay.querySelector(`[data-testid="${testId}"]`)?.addEventListener('click', () => { this.click(); callback(); });
  }

  /** Short interface blip for every menu and dialog interaction. */
  private click(): void {
    this.audio?.sfx('ui',.5);
  }

  private focus(testId: string): void {
    this.overlay.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.focus({ preventScroll: true });
  }

  private choose(index: number): void {
    if (this.screen === 'upgrade' && this.choices[index]) { this.click(); this.callbacks.onUpgrade(this.choices[index].id); }
  }

  private text(key: string, value: string): void {
    if (this.cached.get(key) === value) return;
    this.cached.set(key, value);
    this.elements[key].textContent = value;
  }

  private style(key: string, property: string, value: string): void {
    const cacheKey = `${key}.${property}`;
    if (this.cached.get(cacheKey) === value) return;
    this.cached.set(cacheKey, value);
    this.elements[key].style.setProperty(property, value);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.key === 'Tab' && this.screen !== 'game') {
      const buttons = Array.from(this.overlay.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const current = document.activeElement;
      if (first && last && (!this.overlay.contains(current) || (event.shiftKey && current === first) || (!event.shiftKey && current === last))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      }
      return;
    }
    if (this.screen === 'upgrade' && ['1', '2', '3'].includes(event.key)) {
      event.preventDefault();
      this.choose(Number(event.key) - 1);
    } else if (event.key === 'Enter' && event.target === document.body) {
      event.preventDefault();
      if (this.screen === 'menu') this.callbacks.onStart(this.selectedClass, this.selectedMode);
      else if (this.screen === 'death') this.callbacks.onRestart();
      else if (this.screen === 'pause') this.callbacks.onResume();
      else if (this.screen === 'reward' && !this.root.classList.contains('reward-claimed')) this.callbacks.onClaimReward();
    }
  };
}
