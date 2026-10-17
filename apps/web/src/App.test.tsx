import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { I18nProvider } from './i18n';
import { SettingsProvider } from './settings-context';

function setup(fetchImpl?: (u: string, i?: RequestInit) => Promise<Response>) {
  return render(
    <I18nProvider initial="en">
      <SettingsProvider fetchImpl={fetchImpl}>
        <App />
      </SettingsProvider>
    </I18nProvider>,
  );
}

describe('app shell', () => {
  it('always shows the stub-auth banner and nav landmarks', () => {
    setup();
    expect(screen.getByRole('note')).toHaveTextContent(/STUB AUTH/);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('switches to Japanese', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/Language/), 'ja');
    expect(screen.getByRole('note')).toHaveTextContent('スタブ認証');
  });

  it('saves stub ids from the dev settings screen and sends them as headers', async () => {
    const seen: RequestInit[] = [];
    setup(async (_u, init) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ ok: true, service: 'review-api' }), { status: 200 });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Dev settings' }));
    expect(screen.getByText(/not credentials/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Family id'), 'fam_1');
    await userEvent.type(screen.getByLabelText('Guardian id'), 'grd_1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Check API health' }));
    expect(await screen.findByText('API reachable.')).toBeInTheDocument();
    expect(seen[0]?.headers).toEqual({ 'x-family-id': 'fam_1', 'x-guardian-id': 'grd_1' });
    expect(localStorage.getItem('familiar.dev.stubSettings')).not.toMatch(/token|secret|password/i);
  });

  it('asks for ids on Home until configured', () => {
    setup();
    expect(screen.getByText(/Set a family id/)).toBeInTheDocument();
  });
});
