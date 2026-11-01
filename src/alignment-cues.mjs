/**
 * Resolve a Foley cue's position from ElevenLabs character-level alignment.
 * The anchor must be an exact substring of the aligned character stream.
 */
export function resolveCueTimeAfterText({ alignment, normalizedAlignment, expectedText, afterText, occurrence = 1 } = {}) {
  if (typeof afterText !== "string" || !afterText.length) {
    throw new Error("after_text must be a non-empty exact substring");
  }
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
    throw new Error("occurrence must be an integer between 1 and 10");
  }

  const candidates = [normalizedAlignment, alignment].filter((candidate) =>
    candidate && Array.isArray(candidate.characters) &&
    Array.isArray(candidate.character_start_times_seconds) &&
    Array.isArray(candidate.character_end_times_seconds) &&
    candidate.characters.length > 0 &&
    candidate.characters.length === candidate.character_start_times_seconds.length &&
    candidate.characters.length === candidate.character_end_times_seconds.length
  );
  if (!candidates.length) {
    throw new Error("ElevenLabs did not return usable character-level alignment for this synthesis");
  }

  const expectedCandidate = typeof expectedText === "string"
    ? candidates.find((candidate) => candidate.characters.join("") === expectedText)
    : null;
  const anchorCandidate = candidates.find((candidate) => {
    const aligned = candidate.characters.join("");
    let from = 0;
    for (let found = 0; found < occurrence; found += 1) {
      const index = aligned.indexOf(afterText, from);
      if (index < 0) return false;
      from = index + afterText.length;
    }
    return true;
  });
  const selected = expectedCandidate || anchorCandidate || candidates[0];


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
