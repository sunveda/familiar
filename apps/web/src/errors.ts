import { ApiError } from './api/client';
import type { MessageKey } from './i18n/messages';

/** Map any thrown value to a message key + vars; unknown codes fall back to the generic message. */
export function errorMessage(
  e: unknown,
  t: (k: MessageKey, v?: Record<string, string | number>) => string,
): string {
  if (e instanceof ApiError) {
    const key = `error.${e.code}` as MessageKey;
    try {
      const msg = t(key);
      if (msg && msg !== key) return msg;
    } catch {
      /* fall through */
    }
    return t('error.generic', { code: e.code });
  }
  return t('error.generic', { code: 'unknown' });
}
