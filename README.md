# http-retry-after-parse-tools

Parses the HTTP `Retry-After` header into either a delay in seconds or a concrete `Date`, handling both the delta-seconds and HTTP-date forms.

## Usage

```js
import { parseRetryAfter, retryAfterDelayMs } from './src/index.js';

const parsed = parseRetryAfter('120');
// { kind: 'delta-seconds', seconds: 120 }

const parsedDate = parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT');
// { kind: 'http-date', date: <Date> }

// Convert to a millisecond delay relative to a reference instant.
const now = new Date();
retryAfterDelayMs(parsed, now); // 120000
retryAfterDelayMs(parsedDate, now); // 0 if the date is in the past
```

## Why this exists

The `Retry-After` header is deceptively simple: RFC 9110 says it is either a non-negative integer number of seconds or an IMF-fixdate. Most code that reads it picks one form and ignores the other, or reaches for `Date.parse` directly and silently accepts strings the grammar does not allow (ISO-8601 timestamps, non-GMT timezones, and so on).

The trade-off here is that `parseRetryAfter` is clock-free. It does not convert delta-seconds into a `Date` because that would require knowing when the response was received, and baking a clock into the parser makes it hard to test and easy to misuse. Instead the parser returns a tagged union, and `retryAfterDelayMs` takes an explicit `now` argument so callers can supply their own clock. The default is `new Date()`, but tests always inject a fixed instant.

The parser validates the shape of an HTTP-date with a regular expression before calling `Date.parse`, so it rejects formats the grammar does not allow. It is deliberately lenient about one thing: the weekday in an HTTP-date is not cross-checked against the actual date. `Date.parse` uses the date fields and ignores a mismatched weekday, and matching that behaviour keeps the parser small. If you need strict weekday validation, check it yourself after parsing.

A second deliberate choice: delta-seconds larger than `Number.MAX_SAFE_INTEGER` are reported as invalid rather than silently losing precision. A delay that large is not useful in practice, and returning a wrong number would be worse than returning an error.

## Edge cases

- A missing or empty header returns `{ kind: 'invalid', reason: 'missing header' }` or `{ kind: 'invalid', reason: 'empty header' }`.
- Leading and trailing whitespace around the value is trimmed; internal whitespace is not allowed.
- An HTTP-date in the past yields a delay of `0` from `retryAfterDelayMs`, not a negative number.
- `retryAfterDelayMs` returns `null` for invalid parsed values, so callers can distinguish "no delay" from "no answer".
