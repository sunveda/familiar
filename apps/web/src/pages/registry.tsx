import type { ReactNode } from 'react';
import type { MessageKey } from '../i18n/messages';
import { HomePage } from './HomePage';
import { SettingsPage } from './SettingsPage';

export interface PageDef {
  id: string;
  labelKey: MessageKey;
  render: () => ReactNode;
}

/** Add pages here; the shell builds navigation from this list. */
export const pages: PageDef[] = [
  { id: 'home', labelKey: 'nav.home', render: () => <HomePage /> },
  { id: 'settings', labelKey: 'nav.settings', render: () => <SettingsPage /> },
];
