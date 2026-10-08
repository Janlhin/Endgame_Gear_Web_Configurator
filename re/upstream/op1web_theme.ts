/**
 * Theme manager — portable, no framework deps.
 * Only two persistent themes: 'light' / 'dark', forced via [data-theme] on <html>.
 * On first run (nothing stored) we seed from the OS preference once, then it's fixed.
 */
import { ref, readonly } from 'vue';

export type ThemePref = 'light' | 'dark';
const STORAGE_KEY = 'op1-theme';

const pref = ref<ThemePref>('dark');
const resolved = ref<'light' | 'dark'>('dark');

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(p: ThemePref) {
  document.documentElement.setAttribute('data-theme', p);
  resolved.value = p;
}

/** Call once at app start (before mount is fine). */
export function initTheme() {
  let stored: ThemePref | null = null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') stored = v;
  } catch { /* storage unavailable */ }

  // First run only: follow the OS preference, then persist it as a fixed choice.
  const initial: ThemePref = stored ?? (systemDark() ? 'dark' : 'light');
  if (!stored) {
    try { localStorage.setItem(STORAGE_KEY, initial); } catch { /* ignore */ }
  }
  pref.value = initial;
  apply(initial);
}

export function setTheme(p: ThemePref) {
  pref.value = p;
  try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  apply(p);
}

/** Flip between light and dark. */
export function toggleTheme() {
  setTheme(pref.value === 'dark' ? 'light' : 'dark');
}

export function useTheme() {
  return { pref: readonly(pref), resolved: readonly(resolved), setTheme, toggleTheme };
}
