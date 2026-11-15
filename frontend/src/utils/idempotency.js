/**
 * A new idempotency key for one money action (one top-up or one withdrawal).
 * The same key is sent again on a double click or a retry, so the server applies the action once.
 * crypto.randomUUID needs a secure context (https or localhost); the fallback covers plain http.
 */
export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const part = () => Math.random().toString(36).slice(2, 12);
  return `${Date.now().toString(36)}-${part()}-${part()}`;
}
