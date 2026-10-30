import test from "node:test";
import assert from "node:assert/strict";
import {
  createFixedWindowRateLimiter,
  createVoiceUsageGuard,
  VoiceUsageLimitError,
} from "../src/usage-guard.mjs";

test("MCP request limiter allows the configured amount and resets each window", () => {
  const limit = createFixedWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  assert.equal(limit(1_000).allowed, true);
  assert.equal(limit(1_001).remaining, 0);
  const blocked = limit(1_002);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  assert.equal(limit(2_000).allowed, true);
});

test("voice usage guard reserves budget before upstream calls and releases concurrency", () => {
  const guard = createVoiceUsageGuard({
    maxBillableCharsPerRequest: 8,
    maxCallsPerMinute: 2,
    maxCallsPerDay: 3,
    maxCharsPerDay: 10,
    maxConcurrent: 1,
  });

  const release = guard.reserve("12345", 1_000);
  assert.deepEqual(
    { calls: guard.getSnapshot(1_001).dayCalls, chars: guard.getSnapshot(1_001).dayChars, active: guard.getSnapshot(1_001).active },
    { calls: 1, chars: 5, active: 1 },
  );

  assert.throws(
    () => guard.reserve("x", 1_001),
    (error) => error instanceof VoiceUsageLimitError && /already running/.test(error.message),
  );

  release();
  release();
  assert.equal(guard.getSnapshot(1_002).active, 0);

  const second = guard.reserve("x", 1_003);
  second();
  assert.throws(
    () => guard.reserve("x", 1_004),
    (error) => error instanceof VoiceUsageLimitError && /rate limit/.test(error.message),
  );
});

test("voice usage guard enforces per-request and daily character limits", () => {
  const guard = createVoiceUsageGuard({
    maxBillableCharsPerRequest: 5,
    maxCallsPerMinute: 10,
    maxCallsPerDay: 10,
    maxCharsPerDay: 6,
    maxConcurrent: 2,
  });

  assert.throws(
    () => guard.reserve("123456", 1_000),
    (error) => error instanceof VoiceUsageLimitError && error.statusCode === 413,
  );

  const release = guard.reserve("12345", 1_000);
  release();

  assert.throws(
    () => guard.reserve("12", 1_001),
    (error) => error instanceof VoiceUsageLimitError && /Daily voice usage/.test(error.message),
  );
});

test("voice usage guard enforces daily call count and resets at UTC midnight", () => {
  const guard = createVoiceUsageGuard({
    maxBillableCharsPerRequest: 10,
    maxCallsPerMinute: 10,
    maxCallsPerDay: 1,
    maxCharsPerDay: 10,
    maxConcurrent: 1,
  });

  const release = guard.reserve("first", Date.parse("2026-10-30T23:59:00Z"));
  release();

  assert.throws(
    () => guard.reserve("again", Date.parse("2026-10-30T23:59:01Z")),
    (error) => error instanceof VoiceUsageLimitError && /Daily voice usage/.test(error.message),
  );

  const nextDay = guard.reserve("new day", Date.parse("2026-10-31T00:00:00Z"));
  nextDay();
  assert.equal(guard.getSnapshot(Date.parse("2026-10-31T00:00:01Z")).dayCalls, 1);
});

test("voice usage guard validates configuration and input", () => {
  assert.throws(() => createVoiceUsageGuard({ maxCallsPerDay: 0 }), /positive safe integer/);
  const guard = createVoiceUsageGuard();
  assert.throws(() => guard.reserve(""), /non-empty string/);
});
