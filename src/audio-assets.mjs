import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePcmWav } from "./wav-audio.mjs";

const SAFE_ID = /^fx_[0-9a-f-]{36}$/i;
const EFFECT_KINDS = new Set(["ambience", "foley"]);

function safeName(value) {
  const base = path.basename(String(value || "sound-effect.wav"))
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const name = base || "sound-effect.wav";
  return name.toLowerCase().endsWith(".wav") ? name : name + ".wav";
}

async function readMetadataFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const metadata = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      metadata.push(JSON.parse(await readFile(path.join(directory, entry.name), "utf8")));
    } catch {
      // Ignore a corrupt metadata record; never expose raw paths or file contents.
    }
  }
  return metadata;
}

export function createAudioAssetStore({
  directory = process.env.AUDIO_ASSET_DIR || path.resolve(process.cwd(), "data", "audio-assets"),
  maxAssetBytes = 20 * 1024 * 1024,
  maxAssetCount = 100,
  maxTotalBytes = 200 * 1024 * 1024,
} = {}) {
  const root = path.resolve(directory);

  async function ensureDirectory() {
    await mkdir(root, { recursive: true });
  }

  async function list() {
    await ensureDirectory();
    const items = await readMetadataFiles(root);
    return items
      .filter((item) => item && SAFE_ID.test(item.id || ""))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  async function save({ buffer, name, kind = "foley" } = {}) {
    await ensureDirectory();
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error("Audio upload body is empty");
    if (buffer.length > maxAssetBytes) throw new Error("Audio asset exceeds the configured file size limit");
    if (!EFFECT_KINDS.has(kind)) throw new Error("Audio asset kind must be ambience or foley");

    const decoded = decodePcmWav(buffer);
    const existing = await list();
    if (existing.length >= maxAssetCount) throw new Error("Audio asset library is full");
    const usedBytes = existing.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    if (usedBytes + buffer.length > maxTotalBytes) throw new Error("Audio asset library storage limit reached");

    const id = "fx_" + randomUUID();
    const metadata = Object.freeze({
      id,
      name: safeName(name),
      kind,
      mimeType: "audio/wav",
      bytes: buffer.length,
      sampleRate: decoded.sampleRate,
      channels: decoded.channelCount,
      durationSec: Number(decoded.durationSec.toFixed(3)),
      createdAt: new Date().toISOString(),
    });

    const audioPath = path.join(root, id + ".wav");
    const metadataPath = path.join(root, id + ".json");
    await writeFile(audioPath, buffer, { flag: "wx", mode: 0o600 });
    try {
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx", mode: 0o600 });
    } catch (error) {
      await unlink(audioPath).catch(() => {});
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
    if (typeof id !== "string" || !SAFE_ID.test(id)) return false;
    await ensureDirectory();
    const existing = await get(id);
    if (!existing) return false;
    await Promise.all([
      unlink(path.join(root, id + ".wav")),
      unlink(path.join(root, id + ".json")),
    ]);
    return true;
  }

  async function getUsage() {
    const items = await list();
    const totalBytes = items.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0);
    return Object.freeze({
      assetCount: items.length,
      totalBytes,
      maxAssetCount,
      maxAssetBytes,
      maxTotalBytes,
    });
  }

  return Object.freeze({ list, save, get, remove, getUsage, directory: root });
}
