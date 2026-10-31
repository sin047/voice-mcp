import { stripAudioTags, speakableCharCount } from "./performance.mjs";

const DEFAULT_TARGET_CHARS = 850;
const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_CONTEXT_CHARS = 160;

function codePoints(value) {
  return Array.from(String(value ?? ""));
}

function isSentenceEnd(chars, index) {
  const char = chars[index];
  if ("。！？!?；;…".includes(char)) return true;
  return char === "." && (index === chars.length - 1 || /\s/u.test(chars[index + 1] || ""));
}

function sentenceAtoms(chars) {
  const atoms = [];
  let start = 0;
  for (let i = 0; i < chars.length; i += 1) {
    if (!isSentenceEnd(chars, i)) continue;
    let end = i + 1;
    while (end < chars.length && "。！？!?；;…".includes(chars[end])) end += 1;
    while (end < chars.length && "」』】）》）\"'”’)]".includes(chars[end])) end += 1;
    while (end < chars.length && /\s/u.test(chars[end])) end += 1;
    if (end > start) atoms.push(chars.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < chars.length) atoms.push(chars.slice(start));
  return atoms;
}

function splitOversizedAtom(atom, maxChars) {
  const pieces = [];
  let start = 0;
  while (start < atom.length) {
    const hardEnd = Math.min(atom.length, start + maxChars);
    if (hardEnd === atom.length) {
      pieces.push(atom.slice(start));
      break;
    }
    let preferredEnd = -1;
    for (let i = start; i < hardEnd; i += 1) {
      if (/[，,、：:；;\s]/u.test(atom[i])) preferredEnd = i + 1;
    }
    const end = preferredEnd > start ? preferredEnd : hardEnd;
    pieces.push(atom.slice(start, end));
    start = end;
  }
  return pieces;
}

export function planVoiceChunks(text, options = {}) {
  if (typeof text !== "string" || !text.trim() || !speakableCharCount(text)) {
    throw new Error("text must contain speakable characters");
  }
  const targetChars = options.targetChars ?? DEFAULT_TARGET_CHARS;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const contextChars = options.contextChars ?? DEFAULT_CONTEXT_CHARS;
  if (!Number.isInteger(targetChars) || targetChars < 100 || targetChars > 1200) {
    throw new Error("targetChars must be an integer between 100 and 1200");
  }
  if (!Number.isInteger(maxChars) || maxChars < targetChars || maxChars > 1200) {
    throw new Error("maxChars must be an integer between targetChars and 1200");
  }
  if (!Number.isInteger(contextChars) || contextChars < 0 || contextChars > 400) {
    throw new Error("contextChars must be an integer between 0 and 400");
  }

  const chars = codePoints(text);
  const atoms = sentenceAtoms(chars).flatMap(atom =>
    atom.length > maxChars ? splitOversizedAtom(atom, maxChars) : [atom]
  );
  const planned = [];
  let current = [];
  let currentLength = 0;
  for (const atom of atoms) {
    if (currentLength && currentLength + atom.length > targetChars) {
      planned.push(current);
      current = [];
      currentLength = 0;
    }
    if (atom.length > maxChars) {
      throw new Error("Internal chunk planner limit exceeded");
    }
    current.push(atom);
    currentLength += atom.length;
    if (currentLength >= targetChars) {
      planned.push(current);
      current = [];
      currentLength = 0;
    }
  }
  if (currentLength) planned.push(current);

  let offset = 0;
  const chunks = planned.map((parts, index) => {
    const chunkText = parts.flat().join("");
    const length = codePoints(chunkText).length;
    const start = offset;
    const end = start + length;
    offset = end;
    const previous = index > 0
      ? chars.slice(Math.max(0, start - contextChars), start).join("")
      : "";
    const next = index < planned.length - 1
      ? chars.slice(end, Math.min(chars.length, end + contextChars)).join("")
      : "";
    return {
      index,
      text: chunkText,
      char_start: start,
      char_end: end,
      character_count: length,
      previous_text: previous || undefined,
      next_text: next || undefined,
    };
  });

  const reconstructed = chunks.map(chunk => chunk.text).join("");
  return {
    chunks,
    chunk_count: chunks.length,
    target_chars: targetChars,
    max_chars: maxChars,
    character_count: chars.length,
    reconstruction_exact: reconstructed === text,
    context_mode: "previous_text_next_text_no_audio_overlap",
  };
}
