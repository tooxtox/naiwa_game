import { BOSSES, CAMPAIGN } from './config';

/** Original story and presentation for the user's yellow, green-eyed Naiwa hero. */
export const THEME = {
  id:'naiwa-happy-reboot',
  title:'奶蛙：快乐回收站',
  shortTitle:'奶蛙',
  subtitle:'快乐回收站',
  englishTitle:'NAIWA · HAPPY REBOOT',
  hero:'奶蛙',
  region:'笑声缓存岛',
  arena:'蛙友广场',
  arenaEnglish:'LAUGH CACHE PLAZA',
  menuKicker:'LET THE LAUGHS RECONNECT',
  story:'表情包岛的快乐缓存突然掉线。复读、阴阳弹幕、缓存堵塞、热搜风暴和红温挤满了频道。奶蛙带上一口奶香，出发回收散落的笑点，让蛙友重新连线。',
  mission:`穿过 ${CAMPAIGN.maxWaves} 层缓存，把快乐带回蛙友广场。`,
  rewardRoom:'快乐小卖部',
  medal:'蛙友快乐认证',
} as const;

export function chapterName(wave:number):string {
  const nextBoss=CAMPAIGN.bossWaves.find(bossWave=>wave<=bossWave);
  if(nextBoss===undefined)return BOSSES[CAMPAIGN.bossWaves[CAMPAIGN.bossWaves.length-1]].chapter;
  return wave===nextBoss?BOSSES[nextBoss].chapter:BOSSES[nextBoss].approach;
}

export const ENEMY_NAMES={melee:'复读小怪',ranged:'弹幕法师',elite:'红温保安'} as const;
