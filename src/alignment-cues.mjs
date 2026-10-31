/**
 * Resolve a Foley cue's position from ElevenLabs character-level alignment.
 * The anchor must be an exact substring of the aligned character stream.
 */
export function resolveCueTimeAfterText({ alignment, normalizedAlignment, afterText, occurrence = 1 } = {}) {
  if (typeof afterText !== "string" || !afterText.length) {
    throw new Error("after_text must be a non-empty exact substring");
  }
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
    throw new Error("occurrence must be an integer between 1 and 10");
  }

  const candidates = [normalizedAlignment, alignment].filter(Boolean);
  let selected = null;
  for (const candidate of candidates) {
    const characters = candidate.characters;
    const starts = candidate.character_start_times_seconds;
    const ends = candidate.character_end_times_seconds;
    if (Array.isArray(characters) && Array.isArray(starts) &&
        Array.isArray(ends) && characters.length === starts.length &&
        characters.length === ends.length && characters.length > 0) {
      selected = { characters, starts, ends };
      break;
    }
  }
  if (!selected) {
    throw new Error("ElevenLabs did not return usable character-level alignment for this synthesis");
  }

  const alignedText = selected.characters.join("");
  let from = 0;
  let matchIndex = -1;
  for (let found = 0; found < occurrence; found += 1) {
    matchIndex = alignedText.indexOf(afterText, from);
    if (matchIndex < 0) {
      throw new Error("after_text was not found in the aligned speech: " + afterText);
    }
    from = matchIndex + afterText.length;
  }

  const finalIndex = matchIndex + afterText.length - 1;
  const atSec = selected.ends[finalIndex];
  if (typeof atSec !== "number" || !Number.isFinite(atSec) || atSec < 0) {
    throw new Error("Alignment returned an invalid end time for after_text");
  }
  const startSec = selected.starts[matchIndex];
  if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0 || atSec < startSec) {
    throw new Error("Alignment returned invalid timing values for after_text");
  }
  return atSec;
}
