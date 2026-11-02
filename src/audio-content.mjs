export const MAX_INLINE_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * Build a standard MCP AudioContent block for clients that can render audio
 * natively, without relying on the optional MCP App iframe or a temporary URL.
 * Large audio stays on the existing HTTPS player URL path to avoid oversized
 * MCP tool responses.
 */
export function createAudioContentBlock(input, mimeType = "audio/wav", {
  maxBytes = MAX_INLINE_AUDIO_BYTES,
} = {}) {
  let buffer;
  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (input instanceof Uint8Array) {
    buffer = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError("Audio content must be a Buffer or Uint8Array");
  }

  if (!buffer.length) throw new Error("Audio content cannot be empty");
  if (typeof mimeType !== "string" || !mimeType.startsWith("audio/")) {
    throw new TypeError("Audio content requires an audio/* MIME type");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative safe integer");
  }
  if (buffer.length > maxBytes) return null;

  return {
    type: "audio",
    data: buffer.toString("base64"),
    mimeType,
    annotations: {
      audience: ["user"],
      priority: 1,
    },
  };
}
