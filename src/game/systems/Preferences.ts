export type TouchLayout = 'arc' | 'compact';
export interface Preferences {
  reducedShake: boolean;
  reducedMotion: boolean;
  touchLayout: TouchLayout;
}

export const PREFERENCES_KEY = 'naiwa.preferences.v1';
const defaults: Preferences = { reducedShake: false, reducedMotion: false, touchLayout: 'arc' };
// Vite can evaluate a module through a hot-update URL and a direct test import.
// Keep one session value across those URLs as well as the production bundle.
const stateKey=Symbol.for('naiwa.preferences.session');
const session=globalThis as typeof globalThis & {[stateKey]?:Readonly<Preferences>};

/** Storage can be unavailable in private browsing; the in-memory preference still works. */
export function getPreferences(): Readonly<Preferences> {
  if (!session[stateKey]) {
    const current = { ...defaults };
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
      if (saved && typeof saved === 'object') {
        const value = saved as Partial<Preferences>;
        if (typeof value.reducedShake === 'boolean') current.reducedShake = value.reducedShake;
        if (typeof value.reducedMotion === 'boolean') current.reducedMotion = value.reducedMotion;
        if (value.touchLayout === 'arc' || value.touchLayout === 'compact') current.touchLayout = value.touchLayout;
      }
    } catch { /* Keep safe defaults for corrupt or inaccessible storage. */ }
    session[stateKey]=current;
  }
  return session[stateKey]!;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  const previous = getPreferences();
  session[stateKey] = { ...previous, [key]: value };
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(session[stateKey])); } catch { /* Session preference remains usable. */ }
  window.dispatchEvent(new CustomEvent('naiwasettingschange', { detail: getPreferences() }));
}
