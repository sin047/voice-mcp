import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePcmWav } from "./wav-audio.mjs";

const SAFE_ID = /^rec_[0-9a-f-]{36}$/i;

function safeText(value, max = 1200) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

async function readRecords(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const item = JSON.parse(await readFile(path.join(directory, entry.name), "utf8"));
      if (item && SAFE_ID.test(item.id || "")) records.push(item);
    } catch {
      // Ignore an incomplete metadata record; never expose filesystem paths.
    }
  }
  return records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createRecordingStore({
  directory = process.env.RECORDING_DIR || path.resolve(process.cwd(), "data", "recordings"),
  maxRecordingBytes = 64 * 1024 * 1024,
  maxRecordingCount = 500,
  maxTotalBytes = 2 * 1024 * 1024 * 1024,
} = {}) {
  const root = path.resolve(directory);
  const ensureDirectory = () => mkdir(root, { recursive: true });

  async function list() {
    await ensureDirectory();
    return readRecords(root);
  }

  async function save({ buffer, text = "", performance = "natural", language = "auto", cues = [], source = "speak_with_soundscape" } = {}) {
    await ensureDirectory();
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("Recording WAV body is empty");
    if (buffer.length > maxRecordingBytes) throw new Error("Recording exceeds the configured file size limit");
    const decoded = decodePcmWav(buffer);
    const existing = await list();
    if (existing.length >= maxRecordingCount) throw new Error("Recording archive is full");
    const usedBytes = existing.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    if (usedBytes + buffer.length > maxTotalBytes) throw new Error("Recording archive storage limit reached");

    const id = "rec_" + randomUUID();
    const metadata = Object.freeze({
      id,
      fileName: id + ".wav",
      mimeType: "audio/wav",
      bytes: buffer.length,
      sampleRate: decoded.sampleRate,
      channels: decoded.channelCount,
      durationSec: Number(decoded.durationSec.toFixed(3)),
      text: safeText(text),
      performance: safeText(performance, 32),
      language: safeText(language, 8),
      source: safeText(source, 48),
      cues: Array.isArray(cues) ? cues.slice(0, 12).map((cue) => ({
        asset_id: safeText(cue.asset_id, 64),
        kind: safeText(cue.kind, 16),
        at_sec: Number.isFinite(cue.at_sec) ? cue.at_sec : 0,
        duration_sec: Number.isFinite(cue.duration_sec) ? cue.duration_sec : null,
      })) : [],
      createdAt: new Date().toISOString(),
    });

    const wavPath = path.join(root, id + ".wav");
    const jsonPath = path.join(root, id + ".json");
    await writeFile(wavPath, buffer, { flag: "wx", mode: 0o600 });
    try {
      await writeFile(jsonPath, JSON.stringify(metadata, null, 2), { flag: "wx", mode: 0o600 });
    } catch (error) {
      await unlink(wavPath).catch(() => {});
      throw error;
    }
    return metadata;
  }

  async function get(id) {
    if (typeof id !== "string" || !SAFE_ID.test(id)) return null;
    await ensureDirectory();
    try {
      const metadata = JSON.parse(await readFile(path.join(root, id + ".json"), "utf8"));
      const buffer = await readFile(path.join(root, id + ".wav"));
      return { metadata, buffer };
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async function remove(id) {
    const record = await get(id);
    if (!record) return false;
    await Promise.all([
      unlink(path.join(root, id + ".wav")),
      unlink(path.join(root, id + ".json")),
    ]);
    return true;
  }

  async function update(id, patch = {}) {
    const record = await get(id);
    if (!record) return null;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      throw new Error("Recording metadata update must be an object");
    }
    const allowed = new Set(["title", "tags", "favorite"]);
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) throw new Error("Unsupported recording metadata field: " + key);
    }

    const metadata = { ...record.metadata };
    if (Object.hasOwn(patch, "title")) {
      if (typeof patch.title !== "string") throw new Error("Recording title must be text");
      metadata.title = safeText(patch.title, 120).trim();
    }
    if (Object.hasOwn(patch, "tags")) {
      if (!Array.isArray(patch.tags) || patch.tags.length > 12 || patch.tags.some((tag) => typeof tag !== "string")) {
        throw new Error("Recording tags must be an array of up to 12 text values");
      }
      metadata.tags = [...new Set(patch.tags.map((tag) => safeText(tag, 24).trim()).filter(Boolean))].slice(0, 12);
    }
    if (Object.hasOwn(patch, "favorite")) {
      if (typeof patch.favorite !== "boolean") throw new Error("Recording favorite must be a boolean");
      metadata.favorite = patch.favorite;
    }
    metadata.updatedAt = new Date().toISOString();

    const jsonPath = path.join(root, id + ".json");
    const tempPath = path.join(root, id + "." + randomUUID() + ".tmp");
    try {
      await writeFile(tempPath, JSON.stringify(metadata, null, 2), { flag: "wx", mode: 0o600 });
      await rename(tempPath, jsonPath);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
    return metadata;
  }

  async function getUsage() {
    const records = await list();
    return {
      recordingCount: records.length,
      totalBytes: records.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0),
      maxRecordingCount,
      maxRecordingBytes,
      maxTotalBytes,
    };
  }

  return Object.freeze({ list, save, get, update, remove, getUsage, directory: root });
}
