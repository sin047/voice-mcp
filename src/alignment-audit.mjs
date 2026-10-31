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
 * Audits provider character alignment only. This is not speech recognition
 * and cannot prove that the rendered waveform contains every intended word.
 */
export function auditCharacterAlignment({ expectedText, alignment, normalizedAlignment } = {}) {
  const candidates = [
    ["normalized", normalizedAlignment],
    ["raw", alignment],
  ];
  const selected = candidates.find(([, value]) => usableAlignment(value));
  if (!selected) {
    return {
      available: false,
      exact_text_match: false,
      monotonic_timestamps: false,
      issues: ["Character-level alignment is unavailable or incomplete"],
      note: "Alignment diagnostics are not ASR and cannot verify the audible waveform.",
    };
  }

  const [source, data] = selected;
  const expected = stripAudioTags(expectedText ?? "");
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
    exact_text_match: exactMatch,
    monotonic_timestamps: monotonic,
    first_character_start_sec: starts[0],
    final_character_end_sec: ends[ends.length - 1],
    issues,
    note: "Alignment diagnostics are not ASR and cannot verify that the waveform audibly contains every intended word.",
  };
}
