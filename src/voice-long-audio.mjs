export function joinPcm16Chunks(chunks, {
  sampleRate = 24000,
  channels = 1,
  boundaryPauseMs = 60,
  maxDurationSec = 180,
} = {}) {
  if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 12) {
    throw new Error("chunks must contain between 1 and 12 PCM buffers");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("sampleRate must be between 8000 and 96000 Hz");
  }
  if (![1, 2].includes(channels)) {
    throw new Error("channels must be mono or stereo");
  }
  if (!Number.isInteger(boundaryPauseMs) || boundaryPauseMs < 0 || boundaryPauseMs > 500) {
    throw new Error("boundaryPauseMs must be an integer between 0 and 500");
  }
  if (!Number.isFinite(maxDurationSec) || maxDurationSec <= 0 || maxDurationSec > 180) {
    throw new Error("maxDurationSec must be greater than zero and no more than 180 seconds");
  }

  const frameBytes = channels * 2;
  const buffers = chunks.map((chunk, index) => {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : chunk instanceof Uint8Array
        ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : null;
    if (!buffer || !buffer.length || buffer.length % frameBytes !== 0) {
      throw new Error("PCM chunk " + (index + 1) + " is empty or has an incomplete sample frame");
    }
    return buffer;
  });

  const chunkFrames = buffers.map(buffer => buffer.length / frameBytes);
  const pauseFrames = Math.round(sampleRate * boundaryPauseMs / 1000);
  const frameCount = chunkFrames.reduce((sum, count) => sum + count, 0) +
    pauseFrames * Math.max(0, buffers.length - 1);
  const durationSec = frameCount / sampleRate;
  if (durationSec > maxDurationSec) {
    throw new Error("Joined voice audio exceeds the " + maxDurationSec + " second limit");
  }

  const output = Buffer.alloc(frameCount * frameBytes);
  let byteOffset = 0;
  for (let index = 0; index < buffers.length; index += 1) {
    buffers[index].copy(output, byteOffset);
    byteOffset += buffers[index].length;
    if (index < buffers.length - 1) byteOffset += pauseFrames * frameBytes;
  }

  return {
    buffer: output,
    frameCount,
    durationSec,
    sampleRate,
    channels,
    boundaryPauseMs,
    chunkDurationsSec: chunkFrames.map(count => count / sampleRate),
  };
}
