import { useI18n } from '../i18n';
import { useSettings } from '../settings-context';

export function HomePage() {
  const { t } = useI18n();
  const { hasAuth } = useSettings();
  return (
    <section aria-labelledby="home-h">
      <h2 id="home-h">{t('home.heading')}</h2>
      <p>{t('home.body')}</p>
      {!hasAuth && <p className="warn">{t('home.needSettings')}</p>}
    </section>
  );
}
