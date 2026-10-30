const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(name + " must be a positive safe integer");
  }
  return parsed;
}

export class VoiceUsageLimitError extends Error {
  constructor(message, { statusCode = 429, retryAfterSeconds = 60 } = {}) {
    super(message);
    this.name = "VoiceUsageLimitError";
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Process-local fixed-window request limiter.
 * Intended as a low-cost abuse guard for a single private MCP instance.
 */
export function createFixedWindowRateLimiter({
  limit = 120,
  windowMs = MINUTE_MS,
} = {}) {
  const safeLimit = positiveInteger(limit, 120, "limit");
  const safeWindowMs = positiveInteger(windowMs, MINUTE_MS, "windowMs");
  let currentBucket = null;
  let count = 0;

  return (now = Date.now()) => {
    if (!Number.isFinite(now)) throw new Error("now must be a finite timestamp");
    const bucket = Math.floor(now / safeWindowMs);
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      count = 0;
    }
    if (count >= safeLimit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((bucket + 1) * safeWindowMs - now) / 1000),
      );
      return Object.freeze({ allowed: false, retryAfterSeconds, remaining: 0 });
    }
    count += 1;
    return Object.freeze({ allowed: true, retryAfterSeconds: 0, remaining: safeLimit - count });
  };
}

/**
 * Process-local ElevenLabs usage guard.
 *
 * Reservations are counted before the upstream request and are not refunded
 * when ElevenLabs returns an error, so retries cannot bypass the spend ceiling.
 * The caller must always invoke the returned release function in a finally block.
 */
export function createVoiceUsageGuard(options = {}) {
  const limits = Object.freeze({
    maxBillableCharsPerRequest: positiveInteger(
      options.maxBillableCharsPerRequest, 4_200, "maxBillableCharsPerRequest",
    ),
    maxCallsPerMinute: positiveInteger(options.maxCallsPerMinute, 8, "maxCallsPerMinute"),
    maxCallsPerDay: positiveInteger(options.maxCallsPerDay, 120, "maxCallsPerDay"),
    maxCharsPerDay: positiveInteger(options.maxCharsPerDay, 12_000, "maxCharsPerDay"),
    maxConcurrent: positiveInteger(options.maxConcurrent, 2, "maxConcurrent"),
  });

  let minuteBucket = null;
  let minuteCalls = 0;
  let dayKey = null;
  let dayCalls = 0;
  let dayChars = 0;
  let active = 0;

  function rotateWindows(now) {
    const nextMinuteBucket = Math.floor(now / MINUTE_MS);
    if (nextMinuteBucket !== minuteBucket) {
      minuteBucket = nextMinuteBucket;
      minuteCalls = 0;
    }

    const nextDayKey = new Date(now).toISOString().slice(0, 10);
    if (nextDayKey !== dayKey) {
      dayKey = nextDayKey;
      dayCalls = 0;
      dayChars = 0;
    }
  }

  function reserve(billableText, now = Date.now()) {
    if (typeof billableText !== "string" || !billableText.length) {
      throw new Error("billableText must be a non-empty string");
    }
    if (!Number.isFinite(now)) throw new Error("now must be a finite timestamp");

    const billableChars = billableText.length;
    if (billableChars > limits.maxBillableCharsPerRequest) {
      throw new VoiceUsageLimitError(
        "Speech request exceeds the configured per-request character limit",
        { statusCode: 413, retryAfterSeconds: 0 },
      );
    }

    rotateWindows(now);

    if (active >= limits.maxConcurrent) {
      throw new VoiceUsageLimitError("Too many voice generations are already running", {
        retryAfterSeconds: 2,
      });
    }

    if (minuteCalls >= limits.maxCallsPerMinute) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((minuteBucket + 1) * MINUTE_MS - now) / 1000),
      );
      throw new VoiceUsageLimitError("Voice generation rate limit reached", { retryAfterSeconds });
    }

    const nextUtcMidnight = Date.parse(dayKey + "T00:00:00.000Z") + DAY_MS;
    const dailyRetryAfter = Math.max(1, Math.ceil((nextUtcMidnight - now) / 1000));
    if (dayCalls >= limits.maxCallsPerDay || dayChars + billableChars > limits.maxCharsPerDay) {
      throw new VoiceUsageLimitError("Daily voice usage limit reached", {
        retryAfterSeconds: dailyRetryAfter,
      });
    }

    minuteCalls += 1;
    dayCalls += 1;
    dayChars += billableChars;
    active += 1;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
    };
  }

  return Object.freeze({
    limits,
    reserve,
    getSnapshot(now = Date.now()) {
      rotateWindows(now);
      return Object.freeze({
        dayKey,
        minuteCalls,
        dayCalls,
        dayChars,
        active,
        limits,
      });
    },
  });
}
