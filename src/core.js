const DELTA_SECONDS_RE = /^\d+$/;
const HTTP_DATE_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Parse an HTTP Retry-After header value.
 *
 * The header takes one of two forms:
 *   - delta-seconds: a non-negative decimal integer (e.g. "120")
 *   - HTTP-date: an IMF-fixdate string (e.g. "Wed, 21 Oct 2015 07:28:00 GMT")
 *
 * We return a discriminated union so callers can distinguish the two cases
 * without guessing from the shape of the value. The HTTP-date form is parsed
 * to a Date at UTC midnight? No, the exact instant encoded in the string.
 * The delta-seconds form is kept as a number of seconds because converting it
 * to a Date would require a clock, and this function is deliberately clock-free
 * so it is testable and composable.
 *
 * @param {string} value - the raw header value, or null/undefined if absent.
 * @returns {{ kind: 'delta-seconds', seconds: number } |
 *           { kind: 'http-date', date: Date } |
 *           { kind: 'invalid', reason: string }}
 */
export function parseRetryAfter(value) {
  if (value === null || value === undefined) {
    return { kind: 'invalid', reason: 'missing header' };
  }
  if (typeof value !== 'string') {
    return { kind: 'invalid', reason: 'not a string' };
  }

  // Trim only leading/trailing whitespace. HTTP header values are allowed to
  // have optional whitespace around them, but internal whitespace is part of
  // the date grammar.
  const trimmed = value.trim();
  if (trimmed === '') {
    return { kind: 'invalid', reason: 'empty header' };
  }

  if (DELTA_SECONDS_RE.test(trimmed)) {
    // Number() on a digit-only string is safe and will not produce NaN.
    // We reject values that are too large to represent exactly as a JS number
    // because silently losing precision would be worse than reporting invalid.
    const seconds = Number(trimmed);
    if (!Number.isSafeInteger(seconds)) {
      return { kind: 'invalid', reason: 'delta-seconds out of range' };
    }
    return { kind: 'delta-seconds', seconds };
  }

  if (HTTP_DATE_RE.test(trimmed)) {
    // Date.parse understands IMF-fixdate, but we validate the shape first so
    // that Date.parse's lenient behaviour (e.g. accepting "2015-10-21") does
    // not make us accept things the HTTP grammar does not allow.
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      return { kind: 'invalid', reason: 'unparseable HTTP-date' };
    }
    return { kind: 'http-date', date: new Date(ms) };
  }

  return { kind: 'invalid', reason: 'unrecognized Retry-After format' };
}

/**
 * Convert a parsed Retry-After value into a delay in milliseconds relative to
 * a supplied "now" Date.
 *
 * Why a clock argument? Because the delta-seconds form is relative to the
 * moment the response is received, and the HTTP-date form is absolute. To
 * compare them on the same axis we need a reference instant. Injecting the
 * clock keeps this function pure and makes tests deterministic.
 *
 * For an HTTP-date in the past, the delay is clamped to zero: the server has
 * already said "retry now", and a negative delay would be meaningless to a
 * caller scheduling a timer.
 *
 * @param {{ kind: 'delta-seconds', seconds: number } |
 *           { kind: 'http-date', date: Date } |
 *           { kind: 'invalid', reason: string }} parsed
 * @param {Date} [now] - reference instant; defaults to new Date().
 * @returns {number | null} delay in milliseconds, or null if parsed is invalid.
 */
export function retryAfterDelayMs(parsed, now = new Date()) {
  if (parsed.kind === 'delta-seconds') {
    return parsed.seconds * 1000;
  }
  if (parsed.kind === 'http-date') {
    const delta = parsed.date.getTime() - now.getTime();
    return delta > 0 ? delta : 0;
  }
  return null;
}
