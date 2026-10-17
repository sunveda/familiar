import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { useSettings } from '../settings-context';
import { errorMessage } from '../errors';

export function SettingsPage() {
  const { t } = useI18n();
  const { settings, update, client } = useSettings();
  const [form, setForm] = useState(settings);
  const [status, setStatus] = useState<string>('');

  function onSave(e: FormEvent) {
    e.preventDefault();
    update({
      baseUrl: form.baseUrl.trim(),
      familyId: form.familyId.trim(),
      guardianId: form.guardianId.trim(),
    });
    setStatus(t('settings.saved'));
  }

  async function onCheck() {
    try {
      // Health is public on the server; the client still needs ids set, so save first.
      await client.health();
      setStatus(t('settings.healthOk'));
    } catch (e) {
      setStatus(`${t('settings.healthFail')} ${errorMessage(e, t)}`);
    }
  }

  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">{t('settings.heading')}</h2>
      <p className="warn">{t('settings.warning')}</p>
      <form onSubmit={onSave}>
        <label>
          {t('settings.baseUrl')}
          <input
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label>
          {t('settings.familyId')}
          <input
            value={form.familyId}
            onChange={(e) => setForm({ ...form, familyId: e.target.value })}
            autoComplete="off"
          />
        </label>
        <label>
          {t('settings.guardianId')}
          <input
            value={form.guardianId}
            onChange={(e) => setForm({ ...form, guardianId: e.target.value })}
            autoComplete="off"
          />
        </label>
        <div className="row">
          <button type="submit">{t('settings.save')}</button>
          <button type="button" onClick={onCheck}>
            {t('settings.check')}
          </button>
        </div>
      </form>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
