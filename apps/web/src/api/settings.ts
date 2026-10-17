import type { ClientSettings } from './types';

const KEY = 'familiar.dev.stubSettings';

export const DEFAULT_SETTINGS: ClientSettings = {
  baseUrl: '/api',
  familyId: '',
  guardianId: '',
};

/** Dev-only. Holds ids and a base URL, never secrets or tokens. */
export function loadSettings(): ClientSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<ClientSettings>;
    return {
      baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : DEFAULT_SETTINGS.baseUrl,
      familyId: typeof p.familyId === 'string' ? p.familyId : '',
      guardianId: typeof p.guardianId === 'string' ? p.guardianId : '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: ClientSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
