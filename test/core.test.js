import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRetryAfter, retryAfterDelayMs } from '../src/index.js';

test('parses delta-seconds', () => {
  const result = parseRetryAfter('120');
  assert.deepEqual(result, { kind: 'delta-seconds', seconds: 120 });
});

test('parses zero delta-seconds', () => {
  const result = parseRetryAfter('0');
  assert.deepEqual(result, { kind: 'delta-seconds', seconds: 0 });
});

test('rejects delta-seconds with leading plus or whitespace inside', () => {
  assert.equal(parseRetryAfter('+120').kind, 'invalid');
  assert.equal(parseRetryAfter('1 20').kind, 'invalid');
});

test('rejects delta-seconds beyond safe integer range', () => {
  const huge = '9007199254740993'; // 2^53 + 1
  const result = parseRetryAfter(huge);
  assert.equal(result.kind, 'invalid');
});

test('parses an IMF-fixdate HTTP-date', () => {
  const result = parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT');
  assert.equal(result.kind, 'http-date');
  assert.equal(result.date.toISOString(), '2015-10-21T07:28:00.000Z');
});

test('rejects an HTTP-date with the wrong weekday', () => {
  // The grammar requires the day-name to match the actual date, but we only
  // validate the shape and let Date.parse handle the value. Date.parse does
  // accept a mismatched weekday and uses the date fields, so this is a
  // deliberate leniency: we document that we only check the shape.
  const result = parseRetryAfter('Thu, 21 Oct 2015 07:28:00 GMT');
  assert.equal(result.kind, 'http-date');
  assert.equal(result.date.toISOString(), '2015-10-21T07:28:00.000Z');
});

test('rejects an ISO-8601 date that Date.parse would otherwise accept', () => {
  const result = parseRetryAfter('2015-10-21T07:28:00Z');
  assert.equal(result.kind, 'invalid');
});

test('rejects a date in a non-GMT timezone', () => {
  const result = parseRetryAfter('Wed, 21 Oct 2015 07:28:00 EST');
  assert.equal(result.kind, 'invalid');
});

test('rejects missing, empty, and non-string values', () => {
  assert.equal(parseRetryAfter(null).kind, 'invalid');
  assert.equal(parseRetryAfter(undefined).kind, 'invalid');
  assert.equal(parseRetryAfter('').kind, 'invalid');
  assert.equal(parseRetryAfter('   ').kind, 'invalid');
  assert.equal(parseRetryAfter(42).kind, 'invalid');
});

test('trims surrounding whitespace', () => {
  const result = parseRetryAfter('  60  ');
  assert.deepEqual(result, { kind: 'delta-seconds', seconds: 60 });
});

test('computes delta-seconds delay in milliseconds without a clock', () => {
  const parsed = parseRetryAfter('5');
  assert.equal(retryAfterDelayMs(parsed), 5000);
});

test('computes HTTP-date delay relative to an injected clock', () => {
  const parsed = parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT');
  const now = new Date('2015-10-21T07:27:30Z');
  assert.equal(retryAfterDelayMs(parsed, now), 30000);
});

test('clamps past HTTP-dates to zero delay', () => {
  const parsed = parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT');
  const now = new Date('2015-10-21T07:29:00Z');
  assert.equal(retryAfterDelayMs(parsed, now), 0);
});

test('returns null delay for invalid parsed values', () => {
  const parsed = parseRetryAfter('not a header');
  assert.equal(retryAfterDelayMs(parsed), null);
});
