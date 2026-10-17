import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { createReviewApiClient, type FetchLike, type ReviewApiClient } from './api/client';
import { loadSettings, saveSettings } from './api/settings';
import type { ClientSettings } from './api/types';

interface Ctx {
  settings: ClientSettings;
  update: (s: ClientSettings) => void;
  client: ReviewApiClient;
  hasAuth: boolean;
}
const C = createContext<Ctx | null>(null);

export function SettingsProvider({
  children,
  fetchImpl,
}: {
  children: ReactNode;
  fetchImpl?: FetchLike;
}) {
  const [settings, setSettings] = useState<ClientSettings>(loadSettings);
  const client = useMemo(
    () =>
      createReviewApiClient({
        baseUrl: settings.baseUrl,
        auth: { familyId: settings.familyId, guardianId: settings.guardianId },
        fetch: fetchImpl,
      }),
    [settings, fetchImpl],
  );
  const value: Ctx = {
    settings,
    client,
    hasAuth: Boolean(settings.familyId.trim() && settings.guardianId.trim()),
    update: (s) => {
      saveSettings(s);
      setSettings(s);
    },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSettings(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useSettings outside SettingsProvider');
  return v;
}
