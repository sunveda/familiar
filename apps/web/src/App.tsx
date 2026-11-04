import { useState } from 'react';
import { useI18n } from './i18n';
import type { Locale } from './i18n/messages';
import { pages } from './pages/registry';

export function App() {
  const { t, locale, setLocale } = useI18n();
  const [pageId, setPageId] = useState(pages[0]?.id ?? 'home');
  const page = pages.find((p) => p.id === pageId) ?? pages[0];

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="banner" role="note">
        {t('app.stubBanner')}
      </div>
      <header className="bar">
        <h1>{t('app.title')}</h1>
        <nav aria-label={t('nav.label')}>
          <ul>
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === pageId ? 'page' : undefined}
                  onClick={() => setPageId(p.id)}
                >
                  {t(p.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <label className="lang">
          {t('lang.label')}
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
      </header>
      <main id="main" tabIndex={-1}>
        {page?.render()}
      </main>
    </>
  );
}
