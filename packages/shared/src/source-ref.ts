/**
 * Opaque external sourceRef validation.
 *
 * Ingest registers URL/path *placeholders* only. This repo is never a media
 * store: no repo-relative paths, no file: URLs, no local filesystem paths.
 * Stubs must not download or copy bytes.
 */

export const EXTERNAL_SOURCE_REF_SCHEMES = [
  'http',
  'https',
  's3',
  'gs',
  'library',
  'external',
] as const;

export type ExternalSourceRefScheme = (typeof EXTERNAL_SOURCE_REF_SCHEMES)[number];

const ALLOWED = new Set<string>(EXTERNAL_SOURCE_REF_SCHEMES);

/**
 * True when `sourceRef` is a non-empty opaque external pointer.
 * False for empty values and anything that looks like a repo or local path.
 */
export function isExternalSourceRef(sourceRef: string): boolean {
  const trimmed = sourceRef.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return false;
  }
  const colon = trimmed.indexOf(':');
  if (colon <= 0) {
    return false;
  }
  const scheme = trimmed.slice(0, colon).toLowerCase();
  if (!ALLOWED.has(scheme)) {
    return false;
  }
  const rest = trimmed.slice(colon + 1);
  return rest.length > 0;
}
