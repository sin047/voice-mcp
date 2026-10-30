import { createDramaTimeline, createVoiceDuckingEnvelope } from "./drama-timeline.mjs";

const TARGET_SAMPLE_RATE = 44100;
const MAX_SECONDS = 180;

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Audio data must be a Buffer or Uint8Array");
}

export function decodePcmWav(input) {
  const buffer = toBuffer(input);
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Audio asset must be a valid RIFF/WAVE file");
  }

  let format = null;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) throw new Error("WAV chunk exceeds file bounds");

    if (id === "fmt ") {
      if (size < 16) throw new Error("WAV format chunk is incomplete");
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === "data" && dataOffset < 0) {
      dataOffset = start;
      dataSize = size;
    }

    offset = end + (size % 2);
  }

  if (!format || dataOffset < 0) throw new Error("WAV must contain fmt and data chunks");
  const { audioFormat, channels, sampleRate, blockAlign, bitsPerSample } = format;
  if (![1, 3].includes(audioFormat)) throw new Error("Only PCM or IEEE-float WAV assets are supported");
  if (![1, 2].includes(channels)) throw new Error("WAV assets must be mono or stereo");
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("WAV sample rate must be between 8000 and 96000 Hz");
  }
  if (!((audioFormat === 1 && bitsPerSample === 16) ||
        (audioFormat === 3 && bitsPerSample === 32))) {
    throw new Error("WAV assets must use 16-bit PCM or 32-bit float samples");
  }
  const bytesPerSample = bitsPerSample / 8;
  if (blockAlign !== channels * bytesPerSample || dataSize % blockAlign !== 0) {
    throw new Error("WAV block alignment is invalid");
  }

  const frameCount = dataSize / blockAlign;
  if (!frameCount) throw new Error("WAV contains no audio samples");
  const decoded = Array.from({ length: channels }, () => new Float32Array(frameCount));

  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = dataOffset + frame * blockAlign + channel * bytesPerSample;
      let sample = audioFormat === 1
        ? buffer.readInt16LE(sampleOffset) / 32768
        : buffer.readFloatLE(sampleOffset);
      if (!Number.isFinite(sample)) sample = 0;
      decoded[channel][frame] = Math.max(-1, Math.min(1, sample));
    }
  }

  return Object.freeze({
    channels: Object.freeze(decoded),
    channelCount: channels,
    sampleRate,
    durationSec: frameCount / sampleRate,
    frameCount,
  });
}

export function decodeRawPcm16(input, { sampleRate = TARGET_SAMPLE_RATE, channels = 1 } = {}) {
  const buffer = toBuffer(input);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("PCM sample rate must be between 8000 and 96000 Hz");
  }
  if (![1, 2].includes(channels)) throw new Error("PCM must be mono or stereo");
  const blockAlign = channels * 2;
  if (!buffer.length || buffer.length % blockAlign !== 0) {
    throw new Error("Raw PCM data is empty or has an incomplete sample frame");
  }
  const frameCount = buffer.length / blockAlign;
  const decoded = Array.from({ length: channels }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      decoded[channel][frame] = buffer.readInt16LE((frame * channels + channel) * 2) / 32768;
    }
  }
  return Object.freeze({
    channels: Object.freeze(decoded),
    channelCount: channels,
    sampleRate,
    durationSec: frameCount / sampleRate,
    frameCount,
  });
}

export function resampleChannels(channels, fromRate, toRate = TARGET_SAMPLE_RATE) {
  if (!Array.isArray(channels) || !channels.length ||
      !channels.every((channel) => channel && typeof channel.length === "number")) {
    throw new Error("channels must be a non-empty array of sample arrays");
  }
  if (!Number.isFinite(fromRate) || fromRate <= 0 ||
      !Number.isFinite(toRate) || toRate <= 0) {
    throw new Error("Sample rates must be positive finite numbers");
  }
  const inputLength = channels[0].length;
  if (!inputLength || !channels.every((channel) => channel.length === inputLength)) {
    throw new Error("All audio channels must have the same non-zero length");
  }
  if (fromRate === toRate) return channels;
  const outputLength = Math.max(1, Math.round(inputLength * toRate / fromRate));
  return channels.map((input) => {
    const output = new Float32Array(outputLength);
    const ratio = fromRate / toRate;
    for (let i = 0; i < outputLength; i += 1) {
      const position = i * ratio;
      const left = Math.min(inputLength - 1, Math.floor(position));
      const right = Math.min(inputLength - 1, left + 1);
      const fraction = Math.min(1, position - left);
      output[i] = input[left] * (1 - fraction) + input[right] * fraction;
    }
    return output;
  });
}

export function encodePcm16Wav(channels, sampleRate = TARGET_SAMPLE_RATE) {
  if (!Array.isArray(channels) || ![1, 2].includes(channels.length) ||
      !channels.every((channel) => channel && typeof channel.length === "number")) {
    throw new Error("WAV output must contain one or two channels");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("WAV output sample rate must be between 8000 and 96000 Hz");
  }
  const frameCount = channels[0].length;
  if (!frameCount || !channels.every((channel) => channel.length === frameCount)) {
    throw new Error("WAV output channels must have the same non-zero length");
  }

  const channelCount = channels.length;
  const blockAlign = channelCount * 2;
  const dataSize = frameCount * blockAlign;
  const output = Buffer.allocUnsafe(44 + dataSize);
  output.write("RIFF", 0, 4, "ascii");
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8, 4, "ascii");
  output.write("fmt ", 12, 4, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channelCount, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * blockAlign, 28);
  output.writeUInt16LE(blockAlign, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, 4, "ascii");
  output.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, Number(channels[channel][frame]) || 0));
      const integer = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
      output.writeInt16LE(integer, offset);
      offset += 2;
    }
  }
  return output;
}

function getEnvelopeGain(envelope, sampleIndex, frameSize) {
  const frameIndex = Math.min(envelope.length - 1, Math.floor(sampleIndex / frameSize));
  return envelope[frameIndex]?.gain ?? 1;
}

/**
 * Quiet ambient recordings often have a low average level even after
 * peak-normalization (rain is an example). Raise only the quiet ambience bed,
 * while preserving stereo differences and never boosting a peak past ~0.9.
 * This is intentionally separate from per-cue gain and voice ducking.
 */
function ambienceLoudnessBoost(channels) {
  const frames = channels[0]?.length || 0;
  if (!frames) return 1;
  const stride = Math.max(1, Math.floor(frames / 200_000));
  let squared = 0;
  let count = 0;
  let peak = 0;

  for (const channel of channels) {
    for (let i = 0; i < frames; i += stride) {
      const value = channel[i];
      squared += value * value;
      peak = Math.max(peak, Math.abs(value));
      count += 1;
    }
  }

  const rms = count ? Math.sqrt(squared / count) : 0;
  if (rms <= 0.000001 || peak <= 0.000001) return 1;
  const desiredRms = 0.09;
  const headroomCap = Math.max(1, 0.9 / peak);
  return Math.max(1, Math.min(4, desiredRms / rms, headroomCap));
}

/**
 * Foley cues may be tiny fragments from a long recording whose first seconds
 * are almost silent. Measure the actual selected excerpt, not the whole file.
 * The following boost is applied with tanh soft limiting so transient spikes
 * do not clip even when the useful texture is quiet.
 */
function foleyExcerptBoost(channels, startFrame, frames, loop) {
  const sourceFrames = channels[0].length;
  const stride = Math.max(1, Math.floor(frames / 100000));
  let sumSquares = 0;
  let samples = 0;
  for (let frame = 0; frame < frames; frame += stride) {
    const idx = loop ? (startFrame + frame) % sourceFrames : startFrame + frame;
    if (idx >= sourceFrames) break;
    for (const channel of channels) {
      const value = channel[idx];
      sumSquares += value * value;
      samples += 1;
    }
  }
  const rms = samples ? Math.sqrt(sumSquares / samples) : 0;
  if (rms < 0.000001) return 1;
  return Math.max(1, Math.min(16, 0.10 / rms));
}

export function mixSoundscape({
  voicePcm,
  assets,
  cues = [],
  voiceGain = 0.9,
  ambienceBusGain = 0.82,
  foleyBusGain = 0.9,
  masterGain = 0.85,
  duckingEnabled = true,
  duckingAmount = 0.75,
} = {}) {
  const voice = voicePcm?.channels
    ? voicePcm
    : decodeRawPcm16(voicePcm, { sampleRate: TARGET_SAMPLE_RATE, channels: 1 });
  const voiceChannels = resampleChannels(voice.channels, voice.sampleRate, TARGET_SAMPLE_RATE);
  const voiceFrames = voiceChannels[0].length;
  const durationSec = voiceFrames / TARGET_SAMPLE_RATE;
  if (durationSec > MAX_SECONDS) throw new Error("Voice audio exceeds the 180 second mix limit");

  const timeline = createDramaTimeline({
    voiceDurationSec: durationSec,
    voiceGain,
    ambienceBusGain,
    foleyBusGain,
    masterGain,
    duckingEnabled,
    duckingAmount,
    spatialMode: "stereo",
    cues,
  });

  const left = new Float32Array(voiceFrames);
  const right = new Float32Array(voiceFrames);
  for (let i = 0; i < voiceFrames; i += 1) {
    const l = voiceChannels[0][i];
    const r = voiceChannels.length > 1 ? voiceChannels[1][i] : l;
    left[i] = l * timeline.voice.gain;
    right[i] = r * timeline.voice.gain;
  }

  const frameSize = Math.max(1, Math.floor(TARGET_SAMPLE_RATE * 40 / 1000));
  const ambienceEnvelope = duckingEnabled
    ? createVoiceDuckingEnvelope(voiceChannels, TARGET_SAMPLE_RATE, {
      amount: duckingAmount * timeline.mix.ducking.ambienceDepth,
    })
    : [{ gain: 1 }];
  const foleyEnvelope = duckingEnabled
    ? createVoiceDuckingEnvelope(voiceChannels, TARGET_SAMPLE_RATE, {
      amount: duckingAmount * timeline.mix.ducking.foleyDepth,
    })
    : [{ gain: 1 }];

  for (const cue of timeline.cues) {
    const asset = assets instanceof Map ? assets.get(cue.fileId) : assets?.[cue.fileId];
    if (!asset) throw new Error("Audio asset not found: " + cue.fileId);
    const assetBytes = Buffer.isBuffer(asset) || asset instanceof Uint8Array
      ? asset
      : asset?.buffer;
    const decoded = asset?.channels
      ? asset
      : decodePcmWav(assetBytes);
    const sourceChannels = resampleChannels(decoded.channels, decoded.sampleRate, TARGET_SAMPLE_RATE);
    const sourceFrames = sourceChannels[0].length;
    const sourceOffsetFrames = Math.round(cue.sourceOffsetSec * TARGET_SAMPLE_RATE);
    if (sourceOffsetFrames >= sourceFrames) {
      throw new Error("Foley/ambience source offset exceeds audio asset duration");
    }
    const startFrame = Math.round(cue.atSec * TARGET_SAMPLE_RATE);
    const remainingFrames = voiceFrames - startFrame;
    const requestedFrames = cue.durationSec == null
      ? (cue.loop ? remainingFrames : sourceFrames - sourceOffsetFrames)
      : Math.round(cue.durationSec * TARGET_SAMPLE_RATE);
    const cueFrames = Math.min(remainingFrames, requestedFrames,
      cue.loop ? remainingFrames : sourceFrames - sourceOffsetFrames);
    if (cueFrames <= 0) continue;

    const busGain = cue.kind === "ambience"
      ? timeline.mix.ambienceBusGain
      : timeline.mix.foleyBusGain;
    const envelope = cue.kind === "ambience" ? ambienceEnvelope : foleyEnvelope;
    const panAngle = ((cue.pan + 1) / 2) * Math.PI / 2;
    const monoLeft = Math.cos(panAngle);
    const monoRight = Math.sin(panAngle);
    // Ambience is a surrounding stereo bed, not a distant point source.
    // Applying distance attenuation to rain made it practically inaudible.
    const distanceGain = cue.kind === "ambience"
      ? 1
      : Math.min(1, 1 / (1 + 0.7 * Math.max(0, cue.distanceMeters - 1.5)));
    const ambienceBoost = cue.kind === "ambience"
      ? ambienceLoudnessBoost(sourceChannels)
      : 1;
    const foleyBoost = cue.kind === "foley"
      ? foleyExcerptBoost(sourceChannels, sourceOffsetFrames, cueFrames, cue.loop)
      : 1;
    const fadeInFrames = Math.round(cue.fadeInSec * TARGET_SAMPLE_RATE);
    const fadeOutFrames = Math.round(cue.fadeOutSec * TARGET_SAMPLE_RATE);
    const fadeOutStart = cueFrames - fadeOutFrames;

    for (let frame = 0; frame < cueFrames; frame += 1) {
      const sourceFrame = cue.loop
        ? (sourceOffsetFrames + frame) % sourceFrames
        : sourceOffsetFrames + frame;
      if (sourceFrame >= sourceFrames) break;

      let fade = fadeInFrames > 0 ? Math.min(1, frame / fadeInFrames) : 1;
      if (fadeOutFrames > 0 && frame >= fadeOutStart) {
        fade = Math.min(fade, Math.max(0, (cueFrames - frame) / fadeOutFrames));
      }
      const duckGain = getEnvelopeGain(envelope, startFrame + frame, frameSize);
      const gain = cue.gain * busGain * distanceGain * ambienceBoost * fade * duckGain;
      const targetFrame = startFrame + frame;

      const leftSample = sourceChannels[0][sourceFrame];
      const rightSample = sourceChannels.length > 1
        ? sourceChannels[1][sourceFrame] : leftSample;
      const leftFx = cue.kind === "foley" ? Math.tanh(leftSample * foleyBoost) : leftSample;
      const rightFx = cue.kind === "foley" ? Math.tanh(rightSample * foleyBoost) : rightSample;

      if (sourceChannels.length === 1) {
        left[targetFrame] += leftFx * gain * monoLeft;
        right[targetFrame] += rightFx * gain * monoRight;
      } else {
        const balanceLeft = cue.pan > 0 ? 1 - cue.pan : 1;
        const balanceRight = cue.pan < 0 ? 1 + cue.pan : 1;
        left[targetFrame] += leftFx * gain * balanceLeft;
        right[targetFrame] += rightFx * gain * balanceRight;
      }
    }
  }

  let peak = 0;
  for (let i = 0; i < voiceFrames; i += 1) {
    left[i] *= timeline.mix.masterGain;
    right[i] *= timeline.mix.masterGain;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const limiterGain = peak > 0.98 ? 0.98 / peak : 1;
  if (limiterGain < 1) {
    for (let i = 0; i < voiceFrames; i += 1) {
      left[i] *= limiterGain;
      right[i] *= limiterGain;
    }
  }

  const wav = encodePcm16Wav([left, right], TARGET_SAMPLE_RATE);
  return Object.freeze({
    buffer: wav,
    durationSec,
    sampleRate: TARGET_SAMPLE_RATE,
    channels: 2,
    peakBeforeLimiter: peak,
    limiterGain,
    timeline,
  });
}

export const MIX_SAMPLE_RATE = TARGET_SAMPLE_RATE;
export const MIX_MAX_SECONDS = MAX_SECONDS;
