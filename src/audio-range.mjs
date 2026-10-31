/**
 * Parse a single HTTP byte range for audio streaming.
 * Returns null when no range is requested or another range unit is used.
 * Throws RangeError for malformed or unsatisfiable byte ranges.
 */
export function parseByteRange(rangeHeader, totalLength) {
  if (!Number.isSafeInteger(totalLength) || totalLength < 0) {
    throw new TypeError("totalLength must be a non-negative safe integer");
  }
  if (rangeHeader == null || rangeHeader === "") return null;
  if (typeof rangeHeader !== "string") {
    throw new TypeError("rangeHeader must be a string");
  }

  const header = rangeHeader.trim();
  if (!/^bytes=/i.test(header)) return null;

  const match = /^bytes=(\\d*)-(\\d*)$/i.exec(header);
  if (!match || header.includes(",")) {
    throw new RangeError("Unsatisfiable byte range");
  }

  const [, startText, endText] = match;
  if (!startText && !endText) throw new RangeError("Unsatisfiable byte range");
  if (totalLength === 0) throw new RangeError("Unsatisfiable byte range");

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new RangeError("Unsatisfiable byte range");
    }
    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : totalLength - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 0 || start >= totalLength || end < start) {
      throw new RangeError("Unsatisfiable byte range");
    }
    end = Math.min(end, totalLength - 1);
  }

  return Object.freeze({ start, end, length: end - start + 1 });
}
