import { CLASS_IDS, type ClassId, type RunStats } from '../config';

export type RecordMode = 'campaign' | 'quick';
export interface ClassRecord {
  highestWave: number;
  fastestWin: number | null;
  bestCombo: number;
  mostKills: number;
  runs: number;
  wins: number;
  bestScore?: number;
}
export interface RunRecords {
  version: 1;
  campaign: Record<ClassId, ClassRecord>;
  quick: Record<ClassId, ClassRecord>;
}
export const RECORDS_KEY = 'naiwa.records.v1';
const emptyRecord = (): ClassRecord => ({ highestWave: 0, fastestWin: null, bestCombo: 0, mostKills: 0, runs: 0, wins: 0 });
const finite = (value: unknown, fallback = 0): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
let fallback: RunRecords | undefined;
let storageFailed = false;

function emptyRecords(): RunRecords {
  const mode = (): Record<ClassId, ClassRecord> => Object.fromEntries(CLASS_IDS.map(id => [id, emptyRecord()])) as Record<ClassId, ClassRecord>;
  return { version: 1, campaign: mode(), quick: mode() };
}

function hasUnknownSchema():boolean {
  try {
    const raw:unknown=JSON.parse(localStorage.getItem(RECORDS_KEY)??'null');
    if(!raw||typeof raw!=='object')return false;
    const version=(raw as {version?:unknown}).version;
    return version!==undefined&&version!==1;
  } catch {return false;}
}

/** Validate each leaf rather than trusting storage or overwriting the whole file after one bad value. */
export function readRecords(): RunRecords {
  // Quota errors may reject writes while reads still return an older valid file.
  // In that case the in-session record is newer than storage, so prefer it.
  if(storageFailed&&fallback)return structuredClone(fallback);
  const result = emptyRecords();
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECORDS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return storageFailed && fallback ? structuredClone(fallback) : result;
    const saved = raw as Record<string, unknown>;
    // A future schema is left untouched until the game knows how to migrate it.
    if (saved.version !== undefined && saved.version !== 1) return result;
    for (const mode of ['campaign', 'quick'] as const) {
      const data = saved[mode];
      if (!data || typeof data !== 'object') continue;
      for (const classId of CLASS_IDS) {
        const leaf = (data as Record<string, unknown>)[classId];
        if (!leaf || typeof leaf !== 'object') continue;
        const entry = leaf as Partial<ClassRecord>;
        const fastest = finite(entry.fastestWin, -1);
        result[mode][classId] = {
          highestWave: Math.min(mode === 'quick' ? 10 : 50, Math.floor(finite(entry.highestWave))),
          fastestWin: fastest >= 0 ? fastest : null,
          bestCombo: Math.floor(finite(entry.bestCombo)), mostKills: Math.floor(finite(entry.mostKills)),
          runs: Math.floor(finite(entry.runs)), wins: Math.floor(finite(entry.wins)),
          ...(typeof entry.bestScore==='number'&&Number.isFinite(entry.bestScore)&&entry.bestScore>=0?{bestScore:Math.min(100,Math.floor(entry.bestScore))}:{}),
        };
      }
    }
    return result;
  } catch { return fallback ? structuredClone(fallback) : result; }
}

export function recordRun(stats: RunStats & { mode?: RecordMode }, won: boolean): RunRecords {
  const records = readRecords();
  const mode: RecordMode = stats.mode === 'quick' ? 'quick' : 'campaign';
  const classId = CLASS_IDS.includes(stats.classId) ? stats.classId : 'warrior';
  const record = records[mode][classId];
  record.highestWave = Math.max(record.highestWave, Math.min(mode === 'quick' ? 10 : 50, Math.floor(finite(stats.wave))));
  record.bestCombo = Math.max(record.bestCombo, Math.floor(finite(stats.bestCombo)));
  record.mostKills = Math.max(record.mostKills, Math.floor(finite(stats.kills)));
  record.runs++;
  if(stats.summary)record.bestScore=Math.max(record.bestScore??0,Math.min(100,Math.floor(finite(stats.summary.score))));
  if (won) {
    record.wins++;
    const elapsed = finite(stats.elapsed);
    record.fastestWin = record.fastestWin === null ? elapsed : Math.min(record.fastestWin, elapsed);
  }
  fallback = records;
  // An older game must never destroy a newer format it cannot understand.
  // Keep this session's result in memory; leave the stored future file byte-for-byte intact.
  if(hasUnknownSchema()){storageFailed=true;return structuredClone(records);}
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); storageFailed = false; } catch { storageFailed = true; /* No storage must never block the result screen. */ }
  return structuredClone(records);
}
