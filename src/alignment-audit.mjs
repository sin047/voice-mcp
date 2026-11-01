import { stripAudioTags } from "./performance.mjs";

function usableAlignment(value) {
  if (!value || !Array.isArray(value.characters) ||
      !Array.isArray(value.character_start_times_seconds) ||
      !Array.isArray(value.character_end_times_seconds)) return false;
  const length = value.characters.length;
  return length > 0 &&
    value.character_start_times_seconds.length === length &&
    value.character_end_times_seconds.length === length;
}

/**
 * Remove provider-aligned TTS tag characters while retaining the timing
 * metadata for spoken characters. This remains an alignment audit, not ASR.
 */
function stripAlignedAudioTags(value) {
  const entries = value.characters.map((character, index) => ({
    character,
    start: value.character_start_times_seconds[index],
    end: value.character_end_times_seconds[index],
  }));
  const withoutTags = [];
  let removedCharacters = 0;

  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].character === "[") {
      let closingIndex = -1;
      const limit = Math.min(entries.length, index + 182);
      for (let cursor = index + 1; cursor < limit; cursor += 1) {
        const character = entries[cursor].character;
        if (character === "\r" || character === "\n") break;
        if (character === "]") {
          closingIndex = cursor;
          break;
        }
      }
      if (closingIndex > index + 1 && /^[A-Za-z]$/u.test(entries[index + 1].character)) {
        removedCharacters += closingIndex - index + 1;
        index = closingIndex;
        continue;
      }
    }
    withoutTags.push(entries[index]);
  }

  const normalized = [];
  for (let index = 0; index < withoutTags.length;) {
    const current = withoutTags[index];
    if (current.character !== " " && current.character !== "\t") {
      normalized.push(current);
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < withoutTags.length &&
      (withoutTags[end].character === " " || withoutTags[end].character === "\t")) {
      end += 1;
    }
    if (end - index > 1) {
      normalized.push({
        character: " ",
        start: current.start,
        end: withoutTags[end - 1].end,
      });
    } else {
      normalized.push(current);
    }
    index = end;
  }

  while (normalized.length && /^\s$/u.test(normalized[0].character)) normalized.shift();
  while (normalized.length && /^\s$/u.test(normalized[normalized.length - 1].character)) normalized.pop();

  return {
    characters: normalized.map((entry) => entry.character),
    character_start_times_seconds: normalized.map((entry) => entry.start),
    character_end_times_seconds: normalized.map((entry) => entry.end),
    removedAudioTagCharacters: removedCharacters,
  };
}

/**
 * Audits provider character alignment only. This is not speech recognition
 * and cannot prove that the rendered waveform contains every intended word.
 */
export function auditCharacterAlignment({ expectedText, alignment, normalizedAlignment } = {}) {
  const expected = stripAudioTags(expectedText ?? "");
  const candidates = [
    ["normalized", normalizedAlignment],
    ["raw", alignment],
  ]
    .filter(([, value]) => usableAlignment(value))
    .map(([source, raw]) => ({
      source,
      raw,
      data: stripAlignedAudioTags(raw),
    }));

  const selected = candidates.find(({ data }) => data.characters.join("") === expected)
    || candidates[0];

  if (!selected) {
    return {
      available: false,
      exact_text_match: false,
      monotonic_timestamps: false,
      issues: ["Character-level alignment is unavailable or incomplete"],
      note: "Alignment diagnostics are not ASR and cannot verify the audible waveform.",
    };
  }

  const { source, raw, data } = selected;
  const actual = data.characters.join("");
  const starts = data.character_start_times_seconds;
  const ends = data.character_end_times_seconds;
  let monotonic = true;
  const issues = [];
  for (let i = 0; i < starts.length; i += 1) {
    if (!Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) ||
        starts[i] < 0 || ends[i] < starts[i] ||
        (i > 0 && starts[i] < starts[i - 1]) ||
        (i > 0 && ends[i] < ends[i - 1])) {
      monotonic = false;
      break;
    }
  }
  const exactMatch = actual === expected;
  if (!exactMatch) issues.push("Aligned character stream differs from the expected speakable text");
  if (!monotonic) issues.push("Alignment timestamps are invalid or non-monotonic");
  return {
    available: true,
    source,
    expected_characters: Array.from(expected).length,
    aligned_characters: data.characters.length,
    raw_aligned_characters: raw.characters.length,
    stripped_audio_tag_characters: data.removedAudioTagCharacters,
    exact_text_match: exactMatch,
    monotonic_timestamps: monotonic,
    first_character_start_sec: starts[0],
    final_character_end_sec: ends[ends.length - 1],
    issues,
    note: "Alignment diagnostics are not ASR and cannot verify that the rendered waveform audibly contains every intended word.",
  };
}
