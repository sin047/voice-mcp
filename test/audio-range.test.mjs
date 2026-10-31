import test from "node:test";
import assert from "node:assert/strict";
import { parseByteRange } from "../src/audio-range.mjs";

test("returns null when a range is not requested", () => {
  assert.equal(parseByteRange(undefined, 100), null);
  assert.equal(parseByteRange("", 100), null);
  assert.equal(parseByteRange("items=0-10", 100), null);
});

test("parses explicit, open-ended and suffix byte ranges", () => {
  assert.deepEqual(parseByteRange("bytes=0-9", 100), {
    start: 0, end: 9, length: 10,
  });
  assert.deepEqual(parseByteRange("bytes=10-", 100), {
    start: 10, end: 99, length: 90,
  });
  assert.deepEqual(parseByteRange("bytes=-10", 100), {
    start: 90, end: 99, length: 10,
  });
});

test("clamps an explicit end to the last available byte", () => {
  assert.deepEqual(parseByteRange("bytes=90-200", 100), {
    start: 90, end: 99, length: 10,
  });
});

test("rejects malformed, multiple and unsatisfiable byte ranges", () => {
  for (const header of [
    "bytes=", "bytes=-", "bytes=0-1,4-5", "bytes=100-", "bytes=9-2", "bytes=-0",
  ]) {
    assert.throws(() => parseByteRange(header, 100), RangeError, header);
  }
  assert.throws(() => parseByteRange("bytes=0-", 0), RangeError);
});

test("validates total length and header types", () => {
  assert.throws(() => parseByteRange("bytes=0-1", -1), TypeError);
  assert.throws(() => parseByteRange("bytes=0-1", 1.5), TypeError);
  assert.throws(() => parseByteRange(123, 100), TypeError);
});
