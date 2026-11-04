import { describe, expect, it } from 'vitest';
import { en, ja } from './messages';
import { format } from './index';

describe('i18n catalogs', () => {
  it('ja has exactly the same keys as en and no empty strings', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
    for (const v of Object.values(ja)) expect(v.trim()).not.toBe('');
  });
  it('placeholders match between locales', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(ja[k])).toBe(ph(en[k]));
  });
  it('format substitutes vars', () => {
    expect(format('a {x} b', { x: 1 })).toBe('a 1 b');
  });
});
