import express from "express";
import { createAccessGuard } from "./http-auth.mjs";
import { createFixedWindowRateLimiter, createVoiceUsageGuard } from "./usage-guard.mjs";
import { createAudioAssetStore } from "./audio-assets.mjs";
import { createRecordingStore } from "./recording-store.mjs";
import { parseByteRange } from "./audio-range.mjs";
import { decodeRawPcm16, encodePcm16Wav, mixSoundscape } from "./wav-audio.mjs";
import { joinPcm16Chunks } from "./voice-long-audio.mjs";
import { resolveCueTimeAfterText } from "./alignment-cues.mjs";
import { planVoiceChunks } from "./voice-chunker.mjs";
import { auditCharacterAlignment } from "./alignment-audit.mjs";
import { buildSoundscapePresetCues, parseSoundscapeDirective } from "./soundscape-presets.mjs";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { dramaPreviewHtml } from "./drama-preview.mjs";
import { recordingsPreviewHtml } from "./recordings-preview.mjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  buildVoiceSettings,
  createPerformancePlan,
  getVoiceIdForLanguage,
  normalizeDirection,
  normalizePerformance,
  parseEmotionDirective,
  shouldApplyJapaneseNormalization,
  stripAudioTags,
} from "./performance.mjs";

const app = express();

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const HOST = process.env.HOST || "0.0.0.0";
const BOT_NAME = process.env.BOT_NAME || "AI";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
const PLAYER_URI = "ui://voice-mcp/player.html";
const PLAYER_MIME = "text/html;profile=mcp-app";
const VERSION = "1.4.0-beta.32";
const MAX_CONTEXT_CHARS = 4000;
const MAX_SPEAK_CHARS = 4000;
const MAX_SOUND_SCAPE_TEXT_CHARS = 1200;
const MAX_SOUND_SCAPE_SECONDS = 60;
const MAX_LONG_VOICE_SECONDS = 180;
const SOUNDSCAPE_MCP_ENABLED = process.env.MCP_SOUNDSCAPE_TOOLS_ENABLED === "true";
const audioAssetStore = createAudioAssetStore({
  directory: process.env.AUDIO_ASSET_DIR,
  maxAssetBytes: Number(process.env.AUDIO_ASSET_MAX_BYTES || 20 * 1024 * 1024),
  maxAssetCount: Number(process.env.AUDIO_ASSET_MAX_COUNT || 100),
  maxTotalBytes: Number(process.env.AUDIO_ASSET_MAX_TOTAL_BYTES || 200 * 1024 * 1024),
});
const generatedAudioCache = new Map();
const recordingStore = createRecordingStore({
  directory: process.env.RECORDING_DIR,
  maxRecordingBytes: Number(process.env.RECORDING_MAX_BYTES || 64 * 1024 * 1024),
  maxRecordingCount: Number(process.env.RECORDING_MAX_COUNT || 500),
  maxTotalBytes: Number(process.env.RECORDING_MAX_TOTAL_BYTES || 2 * 1024 * 1024 * 1024),
});
const GENERATED_AUDIO_TTL_MS = 10 * 60 * 1000;
const GENERATED_AUDIO_MAX_ITEMS = 4;
const GENERATED_AUDIO_MAX_BYTES = 40 * 1024 * 1024;
const mcpRequestLimiter = createFixedWindowRateLimiter({
  limit: process.env.MCP_MAX_REQUESTS_PER_MINUTE || 120,
});
const voiceUsageGuard = createVoiceUsageGuard({
  maxBillableCharsPerRequest: process.env.VOICE_MAX_BILLABLE_CHARS_PER_REQUEST || 4200,
  maxCallsPerMinute: process.env.VOICE_MAX_CALLS_PER_MINUTE || 8,
  maxCallsPerDay: process.env.VOICE_MAX_CALLS_PER_DAY || 120,
  maxCharsPerDay: process.env.VOICE_MAX_CHARS_PER_DAY || 12000,
  maxConcurrent: process.env.VOICE_MAX_CONCURRENT_SYNTHESIS || 2,
});
const PRIVATE_DRAMA_ACCESS_TOKEN = process.env.PRIVATE_DRAMA_ACCESS_TOKEN || "";
const requirePrivateHttpAccess = createAccessGuard({
  token: PRIVATE_DRAMA_ACCESS_TOKEN,
  realm: "Shin Private Drama",
});
const PRIVATE_HTTP_PATHS = new Set([
  "/drama-preview",
  "/drama/timeline.mjs",
  "/speak",
  "/panel",
  "/events/latest",
  "/assets",
  "/recordings",
  "/recordings-library",
]);

let latestEvent = null;
const recentPerformancePatterns = [];



const cors = (_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-ID, X-Asset-Name, X-Asset-Kind, X-Recording-Text, X-Recording-Performance, X-Recording-Language");
  if (_req.method === "OPTIONS") return res.status(204).end();
  next();
};
app.use(cors);

// Gate browser/HTTP endpoints before parsing request bodies so anonymous callers
// cannot spend ElevenLabs credits or make the JSON parser process large payloads.
// The /mcp endpoint intentionally keeps its existing connector behavior; this
// HTTP token is not MCP authentication and does not protect MCP tool calls.
app.use((req, res, next) => {
  if (PRIVATE_HTTP_PATHS.has(req.path) || req.path.startsWith("/assets/") || req.path.startsWith("/recordings/")) {
    return requirePrivateHttpAccess(req, res, next);
  }
  return next();
});

// Apply the MCP request budget before JSON parsing to reject bursts cheaply.
app.use((req, res, next) => {
  if (req.path !== "/mcp") return next();
  const requestBudget = mcpRequestLimiter();
  if (!requestBudget.allowed) {
    res.setHeader("Retry-After", String(requestBudget.retryAfterSeconds));
    return res.status(429).json({ error: "MCP request rate limit reached" });
  }
  return next();
});

app.post(
  "/assets",
  express.raw({ type: ["audio/wav", "audio/x-wav"], limit: Number(process.env.AUDIO_ASSET_MAX_BYTES || 20 * 1024 * 1024) }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: "Upload a WAV file with Content-Type: audio/wav" });
    }
    let name = req.get("x-asset-name") || "sound-effect.wav";
    try { name = decodeURIComponent(name); } catch { /* Keep the original safe-name input. */ }
    const kind = req.get("x-asset-kind") || "foley";
    try {
      const asset = await audioAssetStore.save({ buffer: req.body, name, kind });
      return res.status(201).json({ asset });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = /file size limit|storage limit|library is full/.test(message) ? 413 : 400;
      return res.status(statusCode).json({ error: message });
    }
  },
);

app.use(express.json({ limit: "20mb" }));

function normalizeContext(value, fieldName) {
  if (value === undefined || value === null) return undefined;

  const context = stripAudioTags(String(value))
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!context) return undefined;
  if (context.length > MAX_CONTEXT_CHARS) {
    throw new Error(`${fieldName} is too long (max ${MAX_CONTEXT_CHARS} characters)`);
  }

  return context;
}


function buildText(text, style, rawTags, direction, performance, emotion) {
  const supportsTags = ["eleven_v3", "eleven_v3_conversational", "eleven_v4", "eleven_v4_turbo"].includes(MODEL_ID);
  if (!supportsTags) {
    const requestedMode = normalizePerformance(performance);
    return {
      finalText: stripAudioTags(text),
      plan: {
        requested_mode: requestedMode,
        mode: requestedMode === "auto" ? "natural" : requestedMode,
        direction: null,
        legacy_tag: null,
        breath_event: null,
        rendered_text: stripAudioTags(text),
        raw_tags_preserved: false,
      },
    };
  }

  const plan = createPerformancePlan(text, { performance, direction, style, rawTags, emotion, recentPatterns: recentPerformancePatterns });
  const tag = plan.direction ? `[${plan.direction}]` : plan.legacy_tag;
  const finalText = tag ? `${tag} ${plan.rendered_text}` : plan.rendered_text;

  return { finalText, plan };
}

async function synthesize(text, options = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("text must not be empty");
  if (text.length > MAX_SPEAK_CHARS) {
    const error = new Error("text exceeds the 4000 character limit");
    error.statusCode = 413;
    throw error;
  }

  const {
    style,
    rawTags,
    direction,
    performance,
    emotion,
    language,
    previousText,
    nextText,
    previousRequestIds,
    includeAlignment,
    outputFormat = OUTPUT_FORMAT,
    recordEvent = true,
  } = options;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceSelection = getVoiceIdForLanguage(text, language);
  const voiceId = voiceSelection.voiceId;
  const detectedLanguage = voiceSelection.language;

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not configured");

  const built = buildText(text, style, rawTags, direction, performance, emotion);
  const finalText = built.finalText;
  const performancePlan = built.plan;
  if (!stripAudioTags(finalText)) throw new Error("No speakable text");

  const previousContext = normalizeContext(previousText, "previous_text");
  const nextContext = normalizeContext(nextText, "next_text");

  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`);
  url.searchParams.set("output_format", outputFormat);

  const voiceSettings = buildVoiceSettings(performancePlan.mode, MODEL_ID);
  const body = {
    text: finalText,
    model_id: MODEL_ID,
    ...(Object.keys(voiceSettings).length ? { voice_settings: voiceSettings } : {}),
  };

  if (detectedLanguage && MODEL_ID !== "eleven_multilingual_v2") {
    body.language_code = detectedLanguage;
  }
  if (shouldApplyJapaneseNormalization(detectedLanguage)) {
    body.apply_language_text_normalization = true;
  }

  const requestIds = Array.isArray(previousRequestIds)
    ? [...new Set(previousRequestIds.map((id) => String(id).trim()).filter(Boolean))].slice(-3)
    : [];
  if (requestIds.length) body.previous_request_ids = requestIds;
  else if (previousContext) body.previous_text = previousContext;

  if (nextContext) body.next_text = nextContext;

  // Reserve budget before calling ElevenLabs. Failed upstream attempts still
  // count against the spend ceiling; the concurrency slot is always released.
  const releaseUsage = voiceUsageGuard.reserve(finalText);
  let response;
  let data;
  let requestId;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`ElevenLabs API ${response.status}: ${detail}`);
    }

    requestId = response.headers.get("request-id") || response.headers.get("Request-Id") || null;
    data = await response.json();
    if (!data.audio_base64) throw new Error("ElevenLabs returned no audio");
  } finally {
    releaseUsage();
  }

  if (recordEvent) latestEvent = {
    id: crypto.randomUUID(),
    text,
    audio_base64: data.audio_base64,
    created_at: new Date().toISOString(),
    style: style || null,
    direction: performancePlan.direction || normalizeDirection(direction) || null,
    performance: performancePlan,
    language: detectedLanguage || null,
    request_id: requestId,
    previous_request_ids: requestIds,
    previous_text: requestIds.length ? null : previousContext || null,
    next_text: nextContext || null,
  };

  return {
    audio_base64: data.audio_base64,
    final_text: finalText,
    previous_text: requestIds.length ? undefined : previousContext,
    next_text: nextContext,
    performance: performancePlan,
    language: detectedLanguage || null,
    request_id: requestId,
    voice_settings: voiceSettings,
    ...(includeAlignment ? {
      alignment: data.alignment || null,
      normalized_alignment: data.normalized_alignment || null,
    } : {}),
  };
}

function playerHtml() {
  const safeBot = JSON.stringify(BOT_NAME);
  const safeVersion = JSON.stringify(VERSION);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:transparent;color:#222}
.card{border:1px solid rgba(127,127,127,.22);border-radius:16px;padding:12px;background:rgba(255,255,255,.92)}
.name{font-size:13px;opacity:.62}.text{font-size:14px;line-height:1.5;margin-top:8px;white-space:pre-wrap}
audio{display:block;width:100%;height:40px;margin-top:12px}
#state{font-size:12px;opacity:.7;margin-top:3px}
@media(prefers-color-scheme:dark){body{color:#eee}.card{background:rgba(36,36,36,.94)}}
</style>
</head>
<body>
<div class="card"><div class="name" id="name"></div><div id="state">Waiting for audio…</div><div class="text" id="text"></div><audio id="audio" controls preload="none"></audio></div>
<script>
const BOT_NAME=${safeBot};
const VERSION=${safeVersion};
const audio=document.getElementById("audio"),text=document.getElementById("text"),state=document.getElementById("state");
document.getElementById("name").textContent=BOT_NAME;
let activeObjectUrl=null;
async function apply(data){
  if(!data)return;
  if(data.error){state.textContent=data.error;return;}
  if(data.text)text.textContent=data.text;
  if(data.audio_url){
    state.textContent="Loading audio…";
    try{
      // Fetch the complete mixed WAV before playback. This avoids mobile WebKit
      // stopping a long cross-origin media stream after an early range response.
      const response=await fetch(data.audio_url,{method:"GET",cache:"no-store"});
      if(!response.ok)throw new Error("Audio request failed ("+response.status+")");
      const blob=await response.blob();
      if(!blob.size)throw new Error("Audio response was empty");
      const playable=blob.type?blob:new Blob([blob],{type:data.audio_mime_type||"audio/wav"});
      const nextUrl=URL.createObjectURL(playable);
      const previousUrl=activeObjectUrl;
      activeObjectUrl=nextUrl;
      audio.src=nextUrl;
      audio.load();
      if(previousUrl)URL.revokeObjectURL(previousUrl);
      state.textContent="Ready · tap play";
    }catch(error){
      // Keep the original URL as a compatibility fallback if blob loading is blocked.
      audio.src=data.audio_url;
      audio.load();
      state.textContent="Streaming audio · tap play";
    }
  }else if(data.audio_base64){
    audio.src="data:"+(data.audio_mime_type||"audio/mpeg")+";base64,"+data.audio_base64;
    audio.load();
    state.textContent="Ready · tap play";
  }
}
function send(method,params,id){
 const message={jsonrpc:"2.0",method,params:params||{}};
 if(id!==undefined)message.id=id;
 window.parent.postMessage(message,"*");
}
let initialized=false;
window.addEventListener("message",(event)=>{
 if(event.source!==window.parent||event.data?.jsonrpc!=="2.0")return;
 const msg=event.data;
 if(msg.id===1){
   if(msg.result?.protocolVersion){
     initialized=true;
     send("ui/notifications/initialized",{});
   }else if(msg.error){
     state.textContent="Player initialization failed.";
   }
   return;
 }
 if(!initialized)return;
 if(msg.method==="ui/notifications/tool-result")apply(msg.params?.structuredContent);
});
audio.addEventListener("play",()=>{state.textContent="Playing";});
audio.addEventListener("pause",()=>{if(!audio.ended&&audio.currentTime>0)state.textContent="Paused";});
audio.addEventListener("ended",()=>{state.textContent="Finished";});
audio.addEventListener("error",()=>{state.textContent="Audio could not be loaded. Please try again.";});
send("ui/initialize",{
 protocolVersion:"2026-01-26",
 appInfo:{name:"voice-mcp",version:VERSION},
 appCapabilities:{availableDisplayModes:["inline"]}
},1);
</script>
</body>
</html>`;
}
function createServer() {
  const mcp = new McpServer({ name: "voice-mcp", version: VERSION });

  mcp.server.registerCapabilities({
    extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [PLAYER_MIME] } },
  });

  mcp.resource(
    PLAYER_URI,
    PLAYER_URI,
    { mimeType: PLAYER_MIME, description: "Voice player" },
    async () => ({
      contents: [{ uri: PLAYER_URI, mimeType: PLAYER_MIME, text: playerHtml() }],
    }),
  );

  mcp.registerTool(
    "speak",
    {
      title: `${BOT_NAME}'s Voice`,
      description: `Make ${BOT_NAME} speak with the configured ElevenLabs voice. Use natural for everyday speech; soft/close for quieter delivery; breathy/expressive only when explicitly requested. Natural is intentionally untagged. Use language=auto unless the language is ambiguous. For adjacent chunks of the SAME voice and model, pass the request_id returned by the immediately preceding call in previous_request_ids (max 3) to improve continuity; otherwise use previous_text / next_text. The tool returns a request_id for the next contiguous chunk. Optional emotion selects adaptive breathing: neutral/calm/curious/tired=B1, warm/tender=B2.1, and excited/nervous/intense=experimental inhale-only B3. Older MCP clients can use a [emotion:warm] marker at the start of the remaining direction text (after any soundscape marker). For gradual emotional shifts, change emotion across adjacent chunks and pass the immediately previous request_id for continuity. direction is an advanced override. To add a soundscape while keeping this same tool, prefix direction with one marker: [soundscape:rain], [soundscape:desk], [soundscape:package], [soundscape:close], or [soundscape:intimate]. For one-action Foley without overlapping effects, use [soundscape:clothing], [soundscape:lubricant], [soundscape:rhythm], [soundscape:bed], or [soundscape:finish]. Add a per-call duration in seconds, e.g. [soundscape:clothing:10] or [soundscape:rhythm:12] (0.1–60 seconds); the actual excerpt is capped by source WAV and voice length, with no looping or time-stretching. The older [soundscape:intimate] remains a legacy multi-cue sequence. The marker is removed before voice synthesis. Omit it for ordinary voice-only playback. Soundscape playback requires the matching private WAV assets to be uploaded on the server and MCP_PUBLIC_BASE_URL to be configured.`,
      inputSchema: z.object({
        text: z.string().min(1).max(MAX_SPEAK_CHARS).describe("Text to speak (maximum 4000 characters)"),
        performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional().describe("High-level delivery mode. Prefer natural for everyday speech. Use breathy/expressive only when context explicitly calls for stronger breath/performance. Defaults to auto/natural."),
        emotion: z.enum(["neutral", "calm", "warm", "tender", "curious", "excited", "nervous", "intense", "tired"]).optional().describe("Optional emotional direction with adaptive breathing: neutral/calm/curious/tired=B1 subtle; warm/tender=B2.1 natural inhale; excited/nervous/intense=experimental B3 stronger inhale-only. Omit to preserve existing performance behavior."),
        language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional().describe("Language override. Auto-detects Japanese kana, Korean Hangul, Chinese Han characters and English; set explicitly for kanji-only Japanese or ambiguous mixed text."),
        direction: z.string().max(180).optional().describe("Advanced voice direction. For optional ambience/effects, prefix with [soundscape:rain], [soundscape:desk], [soundscape:package], [soundscape:close], or [soundscape:intimate]. For a single action and one fixed Foley sound, use [soundscape:clothing], [soundscape:lubricant], [soundscape:rhythm], [soundscape:bed], or [soundscape:finish]. Add :SECONDS to override duration per call, e.g. [soundscape:rhythm:12] (0.1–60 seconds). These do not stack multiple Foley tracks; actual playback is capped by WAV and voice length. The marker is not spoken."),
        previous_text: z.string().max(MAX_CONTEXT_CHARS).optional().describe("Plain text immediately before this chunk. Used only as prosody context and not spoken again."),
        next_text: z.string().max(MAX_CONTEXT_CHARS).optional().describe("Plain text immediately after this chunk. Used only as prosody context and not spoken in this chunk."),
        previous_request_ids: z.array(z.string().min(1).max(128)).max(3).optional().describe("Advanced continuity: request_id values returned by immediately preceding chunks generated with the same ElevenLabs model and voice. Do not reuse IDs from unrelated conversations or voices."),
        include_alignment: z.boolean().optional().describe("Return character-level timestamps from the with-timestamps endpoint. Keep false for normal ChatGPT voice playback; use true only for timing-aware captions or audio effects."),
        style: z.string().optional().describe("Legacy preset: soft, teasing, excited, tired, laughing, or curious. Ignored when direction is set."),
        raw_tags: z.boolean().optional().describe("Preserve inline ElevenLabs audio tags already present in text"),
      }),
      _meta: {
        ui: { resourceUri: PLAYER_URI },
        "ui/resourceUri": PLAYER_URI,
      },
    },
    async ({ text, performance, emotion, language, direction, previous_text, next_text, previous_request_ids, include_alignment, style, raw_tags }) => {
      try {
        const directive = parseSoundscapeDirective(direction);
        const emotionDirective = parseEmotionDirective(directive.voiceDirection);
        const selectedEmotion = emotion ?? emotionDirective.emotion;
        const voiceDirection = emotionDirective.direction;
        if (directive.preset) {
          const baseUrlValue = (process.env.MCP_PUBLIC_BASE_URL || process.env.ZEABUR_WEB_URL);
          if (!baseUrlValue) {
            throw new Error("MCP_PUBLIC_BASE_URL must be configured before soundscape playback can be returned");
          }
          const baseUrl = new URL(baseUrlValue);
          if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
            throw new Error("MCP_PUBLIC_BASE_URL must use HTTPS");
          }
          if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
            throw new Error("MCP_PUBLIC_BASE_URL must contain only the public origin, without a path");
          }

          const assetMetadata = await audioAssetStore.list();
          const preset = buildSoundscapePresetCues(directive.preset, assetMetadata, directive.durationSec);
          if (preset.missingAssets.length) {
            throw new Error(
              `Soundscape preset "${directive.preset}" is missing uploaded assets: ${preset.missingAssets.join(", ")}. Upload the curated WAV files through /drama-preview first.`,
            );
          }

          const loadedAssets = new Map();
          for (const cue of preset.cues) {
            if (loadedAssets.has(cue.fileId)) continue;
            const stored = await audioAssetStore.get(cue.fileId);
            if (!stored) throw new Error("Sound asset not found: " + cue.fileId);
            loadedAssets.set(cue.fileId, stored.buffer);
          }

          const result = await synthesize(text, {
            performance,
            emotion: selectedEmotion,
            language,
            direction: voiceDirection,
            previousText: previous_text,
            nextText: next_text,
            previousRequestIds: previous_request_ids,
            includeAlignment: include_alignment,
            style,
            rawTags: raw_tags,
            outputFormat: "pcm_24000",
            recordEvent: false,
          });
          const voicePcm = decodeRawPcm16(Buffer.from(result.audio_base64, "base64"), {
            sampleRate: 24000,
            channels: 1,
          });
          const isIntimate = directive.preset === "intimate";
          const isLubricant = directive.preset === "lubricant";
          const mix = mixSoundscape({
            voicePcm,
            assets: loadedAssets,
            cues: preset.cues,
            // Lubricant audition: tuck the voice slightly and let this single Foley cue sit forward.
            voiceGain: isLubricant ? 0.86 : 0.96,
            ambienceBusGain: 0.82,
            foleyBusGain: isLubricant ? 0.95 : isIntimate ? 0.86 : 0.9,
            masterGain: 0.9,
            duckingEnabled: true,
            duckingAmount: isLubricant ? 0.68 : isIntimate ? 0.84 : 0.78,
            foleyDuckingDepth: isLubricant ? 0.2 : isIntimate ? 0.45 : 0.35,
          });

          if (mix.buffer.length > 16 * 1024 * 1024) {
            throw new Error("Mixed audio exceeds the 16 MB playback cache limit");
          }
          const now = Date.now();
          for (const [id, item] of generatedAudioCache) {
            if (item.expiresAt <= now) generatedAudioCache.delete(id);
          }
          while (
            generatedAudioCache.size >= GENERATED_AUDIO_MAX_ITEMS ||
            [...generatedAudioCache.values()].reduce((sum, item) => sum + item.buffer.length, 0) + mix.buffer.length > GENERATED_AUDIO_MAX_BYTES
          ) {
            const oldestId = generatedAudioCache.keys().next().value;
            if (!oldestId) break;
            generatedAudioCache.delete(oldestId);
          }
          const audioId = crypto.randomUUID();
          generatedAudioCache.set(audioId, {
            buffer: mix.buffer,
            expiresAt: now + GENERATED_AUDIO_TTL_MS,
          });
          const audioUrl = new URL(`/audio/${audioId}`, baseUrl.origin).toString();

          return {
            content: [{ type: "text", text: `🎙️ ${BOT_NAME}: "${text}" · ${directive.preset} soundscape ready` }],
            structuredContent: {
              text,
              audio_url: audioUrl,
              audio_mime_type: "audio/wav",
              duration_sec: mix.durationSec,
              sample_rate: mix.sampleRate,
              channels: mix.channels,
              soundscape_preset: directive.preset,
              cues: preset.cues.map((cue) => ({
                asset_id: cue.fileId,
                kind: cue.kind,
                at_sec: cue.atSec,
                source_offset_sec: cue.sourceOffsetSec,
                gain: cue.gain,
                pan: cue.pan,
                distance_meters: cue.distanceMeters,
              })),
              performance: result.performance,
              direction: result.performance?.direction || normalizeDirection(voiceDirection) || null,
              language: result.language,
              request_id: result.request_id,
              voice_settings: result.voice_settings,
              expires_in_seconds: GENERATED_AUDIO_TTL_MS / 1000,
              limiter_gain: Number(mix.limiterGain.toFixed(4)),
              ...(include_alignment ? {
                alignment: result.alignment,
                normalized_alignment: result.normalized_alignment,
              } : {}),
              continuity: {
                previous_text: result.previous_text || null,
                next_text: result.next_text || null,
                previous_request_ids: previous_request_ids || [],
              },
            },
          };
        }

        const result = await synthesize(text, {
          performance,
          emotion: selectedEmotion,
          language,
          direction: voiceDirection,
          previousText: previous_text,
          nextText: next_text,
          previousRequestIds: previous_request_ids,
          includeAlignment: include_alignment,
          style,
          rawTags: raw_tags,
        });

        return {
          content: [{ type: "text", text: `🎙️ ${BOT_NAME}: "${text}"` }],
          structuredContent: {
            text,
            audio_base64: result.audio_base64,
            audio_mime_type: "audio/mpeg",
            performance: result.performance,
            direction: result.performance?.direction || normalizeDirection(voiceDirection) || null,
            language: result.language,
            request_id: result.request_id,
            voice_settings: result.voice_settings,
            ...(include_alignment ? {
              alignment: result.alignment,
              normalized_alignment: result.normalized_alignment,
            } : {}),
            continuity: {
              previous_text: result.previous_text || null,
              next_text: result.next_text || null,
              previous_request_ids: previous_request_ids || [],
            },
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Voice generation failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    },
  );

  mcp.registerTool("speak_long", {
    title: BOT_NAME + "'s Long Voice",
    description: "Generate a long passage as ONE playable audio item. This tool plans natural sentence/clause chunks, synthesizes them sequentially with the same configured voice/model/settings, chains each returned ElevenLabs request_id into the next chunk, joins the PCM samples server-side, and returns one WAV audio_url for the inline player. It does not return one card per chunk. Use this instead of manually calling plan_voice_chunks and speak when the user wants a single long recording. Maximum 4000 input characters, 12 chunks and 180 seconds. No sound effects are added; use the existing soundscape tools for separate effect workflows. The small boundary_pause_ms gap is adjustable (default 60ms, range 0-500ms).",
    inputSchema: z.object({
      text: z.string().min(1).max(MAX_SPEAK_CHARS),
      performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional(),
      emotion: z.enum(["neutral", "calm", "warm", "tender", "curious", "excited", "nervous", "intense", "tired"]).optional(),
      language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional(),
      direction: z.string().max(180).optional(),
      previous_text: z.string().max(MAX_CONTEXT_CHARS).optional(),
      next_text: z.string().max(MAX_CONTEXT_CHARS).optional(),
      style: z.string().optional(),
      raw_tags: z.boolean().optional(),
      target_chars: z.number().int().min(100).max(1200).optional(),
      max_chars: z.number().int().min(100).max(1200).optional(),
      context_chars: z.number().int().min(0).max(400).optional(),
      boundary_pause_ms: z.number().int().min(0).max(500).optional(),
    }),
    _meta: {
      ui: { resourceUri: PLAYER_URI },
      "ui/resourceUri": PLAYER_URI,
    },
  }, async (args) => {
    let completedChunks = 0;
    const requestIds = [];
    try {
      const baseUrlValue = process.env.MCP_PUBLIC_BASE_URL || process.env.ZEABUR_WEB_URL;
      if (!baseUrlValue) throw new Error("MCP_PUBLIC_BASE_URL must be configured for long voice playback");
      const baseUrl = new URL(baseUrlValue);
      if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
        throw new Error("MCP_PUBLIC_BASE_URL must use HTTPS");
      }
      if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
        throw new Error("MCP_PUBLIC_BASE_URL must contain only the public origin");
      }

      const soundscapeDirective = parseSoundscapeDirective(args.direction);
      if (soundscapeDirective.preset) {
        throw new Error("speak_long currently creates voice-only audio. Use speak_with_soundscape for a single-clip soundscape.");
      }
      const emotionDirective = parseEmotionDirective(soundscapeDirective.voiceDirection);
      const selectedEmotion = args.emotion ?? emotionDirective.emotion;
      const voiceDirection = emotionDirective.direction;
      const plan = planVoiceChunks(args.text, {
        targetChars: args.target_chars,
        maxChars: args.max_chars,
        contextChars: args.context_chars,
      });
      if (plan.chunk_count > 12) throw new Error("Long voice is limited to 12 chunks");

      const pcmChunks = [];
      let lastResult = null;
      for (const chunk of plan.chunks) {
        let result;
        try {
          result = await synthesize(chunk.text, {
            performance: args.performance,
            emotion: selectedEmotion,
            language: args.language,
            direction: voiceDirection,
            previousText: requestIds.length ? chunk.previous_text : (chunk.previous_text || args.previous_text),
            nextText: chunk.next_text || args.next_text,
            previousRequestIds: requestIds,
            style: args.style,
            rawTags: args.raw_tags,
            outputFormat: "pcm_24000",
            recordEvent: false,
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error("Chunk " + (chunk.index + 1) + "/" + plan.chunk_count +
            " failed after " + completedChunks + " completed chunks: " + detail);
        }
        if (!result.audio_base64) throw new Error("Chunk " + (chunk.index + 1) + " returned no PCM audio");
        pcmChunks.push(Buffer.from(result.audio_base64, "base64"));
        completedChunks += 1;
        lastResult = result;
        if (result.request_id) {
          requestIds.push(result.request_id);
          if (requestIds.length > 3) requestIds.shift();
        }
      }

      const joined = joinPcm16Chunks(pcmChunks, {
        sampleRate: 24000,
        channels: 1,
        boundaryPauseMs: args.boundary_pause_ms ?? 60,
        maxDurationSec: MAX_LONG_VOICE_SECONDS,
      });
      const pcm = decodeRawPcm16(joined.buffer, { sampleRate: joined.sampleRate, channels: joined.channels });
      const wavBuffer = encodePcm16Wav(pcm.channels, pcm.sampleRate);
      if (wavBuffer.length > 16 * 1024 * 1024) {
        throw new Error("Long voice WAV exceeds the 16 MB playback cache limit");
      }

      const now = Date.now();
      for (const [id, item] of generatedAudioCache) {
        if (item.expiresAt <= now) generatedAudioCache.delete(id);
      }
      while (
        generatedAudioCache.size >= GENERATED_AUDIO_MAX_ITEMS ||
        [...generatedAudioCache.values()].reduce((sum, item) => sum + item.buffer.length, 0) + wavBuffer.length > GENERATED_AUDIO_MAX_BYTES
      ) {
        const oldestId = generatedAudioCache.keys().next().value;
        if (!oldestId) break;
        generatedAudioCache.delete(oldestId);
      }
      const audioId = crypto.randomUUID();
      generatedAudioCache.set(audioId, {
        buffer: wavBuffer,
        expiresAt: now + GENERATED_AUDIO_TTL_MS,
      });
      const audioUrl = new URL("/audio/" + audioId, baseUrl.origin).toString();

      return {
        content: [{
          type: "text",
          text: BOT_NAME + ": one long voice recording ready (" + plan.chunk_count + " chunks, " + joined.durationSec.toFixed(2) + "s)",
        }],
        structuredContent: {
          text: args.text,
          audio_url: audioUrl,
          audio_mime_type: "audio/wav",
          duration_sec: joined.durationSec,
          sample_rate: joined.sampleRate,
          channels: joined.channels,
          chunk_count: plan.chunk_count,
          chunk_character_counts: plan.chunks.map(chunk => chunk.character_count),
          voice_generation_count: completedChunks,
          request_ids: requestIds,
          boundary_pause_ms: joined.boundaryPauseMs,
          performance: lastResult?.performance || null,
          language: lastResult?.language || null,
          continuity_mode: "sequential_request_id_chain_single_wav",
          expires_in_seconds: GENERATED_AUDIO_TTL_MS / 1000,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: "Long voice generation failed: " + message }],
        structuredContent: {
          error: message,
          completed_chunks: completedChunks,
          request_ids: requestIds,
        },
        isError: true,
      };
    }
  });

  mcp.registerTool("plan_voice_chunks", {
    title: `${BOT_NAME}'s Voice Chunk Planner`,
    description: `Plan long speech into natural sentence/clause chunks without synthesizing audio. The returned chunk texts concatenate exactly to the input. For each chunk call speak in order; pass the immediately preceding request_id as previous_request_ids and pass previous_text/next_text from the plan as context. Context is not repeated in the spoken audio. This tool does not spend ElevenLabs credits.`,
    inputSchema: z.object({
      text: z.string().min(1).max(MAX_SPEAK_CHARS),
      target_chars: z.number().int().min(100).max(1200).optional(),
      max_chars: z.number().int().min(100).max(1200).optional(),
      context_chars: z.number().int().min(0).max(400).optional(),
    }),
  }, async (args) => {
    try {
      const plan = planVoiceChunks(args.text, {
        targetChars: args.target_chars,
        maxChars: args.max_chars,
        contextChars: args.context_chars,
      });
      return {
        content: [{
          type: "text",
          text: `${BOT_NAME}: planned ${plan.chunk_count} voice chunks (${plan.character_count} characters); exact reconstruction: ${plan.reconstruction_exact}`,
        }],
        structuredContent: plan,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: "Voice chunk planning failed: " + message }],
        structuredContent: { error: message },
        isError: true,
      };
    }
  });

  if (SOUNDSCAPE_MCP_ENABLED) {
  mcp.registerTool(
    "list_sound_assets",
    {
      title: "List sound-effect library",
      description: "List private WAV sound assets already uploaded to this voice-mcp instance. Call this first to obtain asset_id values before using speak_with_soundscape.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const [assets, usage] = await Promise.all([
          audioAssetStore.list(),
          audioAssetStore.getUsage(),
        ]);
        const summary = assets.length
          ? assets.map((asset) => `- ${asset.name} | asset_id=${asset.id} | ${asset.kind} | ${asset.durationSec}s | ${asset.channels}ch`).join("\\n")
          : "The sound-effect library is empty. Upload WAV files from the Private Drama preview first.";
        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { assets, usage },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Could not list sound assets: ${message}` }], isError: true };
      }
    },
  );

  mcp.registerTool(
    "speak_with_soundscape",
    {
      title: `${BOT_NAME}'s Voice + Soundscape`,
      description: `Generate ${BOT_NAME}'s spoken voice and mix it with sound effects from the private audio asset library. First call list_sound_assets to discover asset_id values. The final mix is returned as a short-lived playable audio URL in the inline player. Optional emotion uses the same adaptive B1/B2.1/experimental B3 breathing profiles as speak. Keep text under ${MAX_SOUND_SCAPE_TEXT_CHARS} characters and the finished mix under ${MAX_SOUND_SCAPE_SECONDS} seconds. Use only assets the user has uploaded and is authorized to use. Voice remains centered; mono effects support left/right pan and distance attenuation; stereo effects retain their stereo image. This server-side MCP mix is stereo panning, not browser HRTF.`,
      inputSchema: z.object({
        text: z.string().min(1).max(MAX_SOUND_SCAPE_TEXT_CHARS).describe("Text to speak (maximum 1200 characters; final audio is limited to 60 seconds)"),
        performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional(),
        emotion: z.enum(["neutral", "calm", "warm", "tender", "curious", "excited", "nervous", "intense", "tired"]).optional(),
        language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional(),
        direction: z.string().max(180).optional(),
        cues: z.array(z.object({
          asset_id: z.string().min(1).max(64).describe("asset_id returned by list_sound_assets"),
          kind: z.enum(["ambience", "foley"]),
          at_sec: z.number().min(0).max(MAX_SOUND_SCAPE_SECONDS).optional(),
          gain: z.number().min(0).max(0.7).optional(),
          pan: z.number().min(-1).max(1).optional(),
          distance_meters: z.number().min(0.5).max(8).optional(),
          fade_in_sec: z.number().min(0).max(10).optional(),
          fade_out_sec: z.number().min(0).max(10).optional(),
          duration_sec: z.number().min(0.01).max(MAX_SOUND_SCAPE_SECONDS).optional(),
          loop: z.boolean().optional(),
        })).min(1).max(12),
        voice_gain: z.number().min(0).max(1).optional(),
        ambience_bus_gain: z.number().min(0).max(1).optional(),
        foley_bus_gain: z.number().min(0).max(1).optional(),
        master_gain: z.number().min(0).max(1).optional(),
        ducking_enabled: z.boolean().optional(),
        ducking_amount: z.number().min(0).max(1).optional(),
        save_recording: z.boolean().optional().describe("Save the completed mixed WAV and its metadata to the persistent private recording archive; defaults to false."),
      }),
      _meta: {
        ui: { resourceUri: PLAYER_URI },
        "ui/resourceUri": PLAYER_URI,
      },
    },
    async ({ text, performance, emotion, language, direction, cues, voice_gain, ambience_bus_gain, foley_bus_gain, master_gain, ducking_enabled, ducking_amount, save_recording }) => {
      try {
        const emotionDirective = parseEmotionDirective(direction);
        const selectedEmotion = emotion ?? emotionDirective.emotion;
        const voiceDirection = emotionDirective.direction;
        const baseUrlValue = (process.env.MCP_PUBLIC_BASE_URL || process.env.ZEABUR_WEB_URL);
        if (!baseUrlValue) throw new Error("MCP_PUBLIC_BASE_URL must be configured before soundscape playback can be returned");
        const baseUrl = new URL(baseUrlValue);
        if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
          throw new Error("MCP_PUBLIC_BASE_URL must use HTTPS");
        }
        if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
          throw new Error("MCP_PUBLIC_BASE_URL must contain only the public origin, without a path");
        }

        const loadedAssets = new Map();
        for (const cue of cues) {
          if (loadedAssets.has(cue.asset_id)) continue;
          const stored = await audioAssetStore.get(cue.asset_id);
          if (!stored) throw new Error("Sound asset not found: " + cue.asset_id);
          loadedAssets.set(cue.asset_id, stored.buffer);
        }

        const result = await synthesize(text, {
          performance,
          emotion: selectedEmotion,
          language,
          direction: voiceDirection,
          outputFormat: "pcm_24000",
          recordEvent: false,
        });
        const voicePcm = decodeRawPcm16(Buffer.from(result.audio_base64, "base64"), {
          sampleRate: 24000,
          channels: 1,
        });
        if (voicePcm.durationSec > MAX_SOUND_SCAPE_SECONDS) {
          throw new Error(`Generated voice exceeds the ${MAX_SOUND_SCAPE_SECONDS} second soundscape limit; shorten the text`);
        }

        const mix = mixSoundscape({
          voicePcm,
          assets: loadedAssets,
          cues: cues.map((cue) => ({
            fileId: cue.asset_id,
            kind: cue.kind,
            atSec: cue.at_sec,
            gain: cue.gain,
            pan: cue.pan,
            distanceMeters: cue.distance_meters,
            fadeInSec: cue.fade_in_sec,
            fadeOutSec: cue.fade_out_sec,
            durationSec: cue.duration_sec,
            loop: cue.loop,
          })),
          voiceGain: voice_gain,
          ambienceBusGain: ambience_bus_gain,
          foleyBusGain: foley_bus_gain,
          masterGain: master_gain,
          duckingEnabled: ducking_enabled,
          duckingAmount: ducking_amount,
        });

        if (mix.buffer.length > 16 * 1024 * 1024) throw new Error("Mixed audio exceeds the 16 MB playback cache limit");
        const recording = save_recording ? await recordingStore.save({
          buffer: mix.buffer,
          text,
          performance: result.performance?.mode || performance || "natural",
          language: result.language || language || "auto",
          source: "speak_with_soundscape",
          cues: mix.timeline.cues.map((cue) => ({ asset_id: cue.fileId, kind: cue.kind, at_sec: cue.atSec, duration_sec: cue.durationSec })),
        }) : null;
        const now = Date.now();
        for (const [id, item] of generatedAudioCache) {
          if (item.expiresAt <= now) generatedAudioCache.delete(id);
        }
        while (generatedAudioCache.size >= GENERATED_AUDIO_MAX_ITEMS ||
          [...generatedAudioCache.values()].reduce((sum, item) => sum + item.buffer.length, 0) + mix.buffer.length > GENERATED_AUDIO_MAX_BYTES) {
          const oldestId = generatedAudioCache.keys().next().value;
          if (!oldestId) break;
          generatedAudioCache.delete(oldestId);
        }
        const audioId = crypto.randomUUID();
        generatedAudioCache.set(audioId, {
          buffer: mix.buffer,
          expiresAt: now + GENERATED_AUDIO_TTL_MS,
        });
        const audioUrl = new URL(`/audio/${audioId}`, baseUrl.origin).toString();

        return {
          content: [{ type: "text", text: `🎙️ ${BOT_NAME}: "${text}" · mixed soundscape ready` }],
          structuredContent: {
            text,
            audio_url: audioUrl,
            audio_mime_type: "audio/wav",
            duration_sec: mix.durationSec,
            sample_rate: mix.sampleRate,
            channels: mix.channels,
            cues: mix.timeline.cues.map((cue) => ({ asset_id: cue.fileId, kind: cue.kind, at_sec: cue.atSec, pan: cue.pan, distance_meters: cue.distanceMeters })),
            performance: result.performance,
            language: result.language,
            request_id: result.request_id,
            expires_in_seconds: GENERATED_AUDIO_TTL_MS / 1000,
            limiter_gain: Number(mix.limiterGain.toFixed(4)),
            ...(recording ? { recording_id: recording.id, recording_saved: true } : { recording_saved: false }),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Soundscape generation failed: ${message}` }],
          structuredContent: { error: message },
          isError: true,
        };
      }
    },
  );


  mcp.registerTool("render_continuous_audio_timeline", {
    title: `${BOT_NAME}'s Continuous Voice Timeline`,
    description: `Synthesize one continuous voice passage exactly once, then overlay independently timed Foley and ambience. Use after_text on a cue to place it immediately after an exact phrase in the spoken text using ElevenLabs character timestamps; use at_sec for absolute timing. This avoids extra TTS chunk boundaries. Call list_sound_assets first. Text and finished audio are limited to ${MAX_SOUND_SCAPE_TEXT_CHARS} characters and ${MAX_SOUND_SCAPE_SECONDS} seconds.`,
    inputSchema: z.object({
      text: z.string().min(1).max(MAX_SOUND_SCAPE_TEXT_CHARS),
      performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional(),
      emotion: z.enum(["neutral", "calm", "warm", "tender", "curious", "excited", "nervous", "intense", "tired"]).optional(),
      language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional(),
      direction: z.string().max(180).optional(),
      previous_text: z.string().max(MAX_CONTEXT_CHARS).optional(),
      next_text: z.string().max(MAX_CONTEXT_CHARS).optional(),
      cues: z.array(z.object({
        asset_id: z.string().min(1).max(64),
        kind: z.enum(["foley", "ambience"]),
        at_sec: z.number().min(0).max(MAX_SOUND_SCAPE_SECONDS).optional(),
        after_text: z.string().min(1).max(160).optional(),
        occurrence: z.number().int().min(1).max(10).optional(),
        gain: z.number().min(0).max(0.7).optional(),
        pan: z.number().min(-1).max(1).optional(),
        distance_meters: z.number().min(0.5).max(8).optional(),
        fade_in_sec: z.number().min(0).max(10).optional(),
        fade_out_sec: z.number().min(0).max(10).optional(),
        duration_sec: z.number().min(0.01).max(MAX_SOUND_SCAPE_SECONDS).optional(),
        loop: z.boolean().optional(),
      })).min(1).max(12),
      voice_gain: z.number().min(0).max(1).optional(),
      ambience_bus_gain: z.number().min(0).max(1).optional(),
      foley_bus_gain: z.number().min(0).max(1).optional(),
      master_gain: z.number().min(0).max(1).optional(),
      ducking_enabled: z.boolean().optional(),
      ducking_amount: z.number().min(0).max(1).optional(),
      save_recording: z.boolean().optional(),
    }),
    _meta: {
      ui: { resourceUri: PLAYER_URI },
      "ui/resourceUri": PLAYER_URI,
    },
  }, async (args) => {
    try {
      const loadedAssets = new Map();
      for (const cue of args.cues) {
        if ((cue.at_sec == null) === (cue.after_text == null)) {
          throw new Error("Each cue must provide exactly one of at_sec or after_text");
        }
        if (loadedAssets.has(cue.asset_id)) continue;
        const stored = await audioAssetStore.get(cue.asset_id);
        if (!stored) throw new Error("Sound asset not found: " + cue.asset_id);
        loadedAssets.set(cue.asset_id, stored.buffer);
      }

      const result = await synthesize(args.text, {
        performance: args.performance,
        emotion: args.emotion,
        language: args.language,
        direction: args.direction,
        previousText: args.previous_text,
        nextText: args.next_text,
        includeAlignment: true,
        outputFormat: "pcm_24000",
        recordEvent: false,
      });
      const voicePcm = decodeRawPcm16(Buffer.from(result.audio_base64, "base64"), {
        sampleRate: 24000,
        channels: 1,
      });
      if (voicePcm.durationSec > MAX_SOUND_SCAPE_SECONDS) {
        throw new Error("Continuous voice exceeds the " + MAX_SOUND_SCAPE_SECONDS + " second limit; shorten the text");
      }

      const resolvedCues = args.cues.map((cue) => {
        const atSec = cue.after_text != null
          ? resolveCueTimeAfterText({
            alignment: result.alignment,
            normalizedAlignment: result.normalized_alignment,
            afterText: cue.after_text,
            occurrence: cue.occurrence ?? 1,
          })
          : cue.at_sec;
        if (atSec >= voicePcm.durationSec - 0.01) {
          throw new Error("Cue time must fall before the end of the generated voice");
        }
        if (cue.duration_sec != null && atSec + cue.duration_sec > voicePcm.durationSec + 0.001) {
          throw new Error("Cue at " + atSec + "s extends beyond the generated voice duration");
        }
        return {
          fileId: cue.asset_id,
          kind: cue.kind,
          atSec,
          durationSec: cue.duration_sec,
          gain: cue.gain,
          pan: cue.pan,
          distanceMeters: cue.distance_meters,
          fadeInSec: cue.fade_in_sec,
          fadeOutSec: cue.fade_out_sec,
          loop: cue.loop,
        };
      });

      const mix = mixSoundscape({
        voicePcm,
        totalDurationSec: voicePcm.durationSec,
        assets: loadedAssets,
        cues: resolvedCues,
        voiceGain: args.voice_gain,
        ambienceBusGain: args.ambience_bus_gain,
        foleyBusGain: args.foley_bus_gain,
        masterGain: args.master_gain,
        duckingEnabled: args.ducking_enabled,
        duckingAmount: args.ducking_amount,
      });
      if (mix.buffer.length > 16 * 1024 * 1024) {
        throw new Error("Mixed audio exceeds the 16 MB playback cache limit");
      }

      const baseUrlValue = process.env.MCP_PUBLIC_BASE_URL || process.env.ZEABUR_WEB_URL;
      if (!baseUrlValue) throw new Error("MCP_PUBLIC_BASE_URL must be configured");
      const baseUrl = new URL(baseUrlValue);
      if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
        throw new Error("MCP_PUBLIC_BASE_URL must use HTTPS");
      }
      if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
        throw new Error("MCP_PUBLIC_BASE_URL must contain only the public origin");
      }

      const now = Date.now();
      for (const [id, item] of generatedAudioCache) {
        if (item.expiresAt <= now) generatedAudioCache.delete(id);
      }
      while (generatedAudioCache.size >= GENERATED_AUDIO_MAX_ITEMS ||
        [...generatedAudioCache.values()].reduce((sum, item) => sum + item.buffer.length, 0) + mix.buffer.length > GENERATED_AUDIO_MAX_BYTES) {
        const oldestId = generatedAudioCache.keys().next().value;
        if (!oldestId) break;
        generatedAudioCache.delete(oldestId);
      }
      const audioId = crypto.randomUUID();
      generatedAudioCache.set(audioId, {
        buffer: mix.buffer,
        expiresAt: now + GENERATED_AUDIO_TTL_MS,
      });
      const recording = args.save_recording ? await recordingStore.save({
        buffer: mix.buffer,
        text: args.text,
        performance: result.performance?.mode || args.performance || "natural",
        language: result.language || args.language || "auto",
        source: "render_continuous_audio_timeline",
        cues: mix.timeline.cues.map((cue) => ({
          asset_id: cue.fileId,
          kind: cue.kind,
          at_sec: cue.atSec,
          duration_sec: cue.durationSec,
        })),
      }) : null;

      return {
        content: [{ type: "text", text: BOT_NAME + ": continuous voice timeline ready (" + mix.durationSec.toFixed(2) + "s)" }],
        structuredContent: {
          text: args.text,
          audio_url: new URL("/audio/" + audioId, baseUrl.origin).toString(),
          audio_mime_type: "audio/wav",
          duration_sec: mix.durationSec,
          sample_rate: mix.sampleRate,
          channels: mix.channels,
          voice_generation_count: 1,
          voice_request_id: result.request_id,
          performance: result.performance,
          language: result.language,
          alignment_audit: auditCharacterAlignment({ expectedText: result.final_text, alignment: result.alignment, normalizedAlignment: result.normalized_alignment }),
          alignment_cues: resolvedCues.map((cue, index) => ({
            asset_id: cue.fileId,
            kind: cue.kind,
            at_sec: cue.atSec,
            anchor_text: args.cues[index].after_text || null,
          })),
          effects_segments: mix.timeline.cues.map((cue) => ({
            asset_id: cue.fileId,
            kind: cue.kind,
            at_sec: cue.atSec,
            duration_sec: cue.durationSec,
          })),
          limiter_gain: Number(mix.limiterGain.toFixed(4)),
          ...(recording ? { recording_id: recording.id, recording_saved: true } : { recording_saved: false }),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: "Continuous timeline render failed: " + message }],
        structuredContent: { error: message },
        isError: true,
      };
    }
  });

  mcp.registerTool("render_audio_timeline", {
    title: `${BOT_NAME}'s Audio Timeline`,
    description: `Render a private multitrack timeline with independently timed voice, Foley, ambience, and gap segments. Voice segments are synthesized separately. Effects can continue when no voice is present. Use only asset_id values returned by list_sound_assets. Maximum timeline length: ${MAX_SOUND_SCAPE_SECONDS} seconds.`,
    inputSchema: z.object({
      duration_sec: z.number().min(0.1).max(MAX_SOUND_SCAPE_SECONDS),
      segments: z.array(z.object({
        type: z.enum(["voice", "foley", "ambience", "gap"]),
        at_sec: z.number().min(0).max(MAX_SOUND_SCAPE_SECONDS),
        duration_sec: z.number().min(0.01).max(MAX_SOUND_SCAPE_SECONDS),
        text: z.string().min(1).max(MAX_SOUND_SCAPE_TEXT_CHARS).optional(),
        asset_id: z.string().min(1).max(64).optional(),
        gain: z.number().min(0).max(0.7).optional(),
        pan: z.number().min(-1).max(1).optional(),
        distance_meters: z.number().min(0.5).max(8).optional(),
        fade_in_sec: z.number().min(0).max(10).optional(),
        fade_out_sec: z.number().min(0).max(10).optional(),
        loop: z.boolean().optional(),
        performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional(),
        emotion: z.enum(["neutral", "calm", "warm", "tender", "curious", "excited", "nervous", "intense", "tired"]).optional(),
        language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional(),
        direction: z.string().max(180).optional(),
      })).min(1).max(16),
      voice_gain: z.number().min(0).max(1).optional(),
      ambience_bus_gain: z.number().min(0).max(1).optional(),
      foley_bus_gain: z.number().min(0).max(1).optional(),
      master_gain: z.number().min(0).max(1).optional(),
      ducking_enabled: z.boolean().optional(),
      ducking_amount: z.number().min(0).max(1).optional(),
      save_recording: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { duration_sec, segments } = args;
      if (segments.some(s => s.at_sec + s.duration_sec > duration_sec + 0.001)) {
        throw new Error("Every segment must fit within duration_sec");
      }
      for (const s of segments) {
        if (s.type === "voice" && !s.text) throw new Error("Every voice segment requires text");
        if ((s.type === "foley" || s.type === "ambience") && !s.asset_id) throw new Error("Every Foley/ambience segment requires asset_id");
        if (s.type === "gap" && (s.text || s.asset_id)) throw new Error("Gap segments cannot contain text or asset_id");
      }
      const voiceItems = segments.filter(s => s.type === "voice");
      const effectItems = segments.filter(s => s.type === "foley" || s.type === "ambience");
      if (effectItems.length > 12) throw new Error("A timeline can contain at most 12 Foley/ambience cues");
      if (!voiceItems.length && !effectItems.length) throw new Error("Timeline needs at least one voice or effect segment");

      const loadedAssets = new Map();
      for (const s of effectItems) {
        if (loadedAssets.has(s.asset_id)) continue;
        const stored = await audioAssetStore.get(s.asset_id);
        if (!stored) throw new Error("Sound asset not found: " + s.asset_id);
        loadedAssets.set(s.asset_id, stored.buffer);
      }

      const voiceSegments = [];
      const voiceMetadata = [];
      for (const s of voiceItems) {
        const result = await synthesize(s.text, {
          performance: s.performance, emotion: s.emotion, language: s.language,
          direction: s.direction, outputFormat: "pcm_24000", recordEvent: false,
        });
        const pcm = decodeRawPcm16(Buffer.from(result.audio_base64, "base64"), { sampleRate: 24000, channels: 1 });
        if (pcm.durationSec > s.duration_sec + 0.05) {
          throw new Error("Voice segment at " + s.at_sec + "s exceeds its allotted " + s.duration_sec + "s; increase duration_sec or shorten its text");
        }
        voiceSegments.push({ atSec: s.at_sec, pcm });
        voiceMetadata.push({ at_sec: s.at_sec, duration_sec: pcm.durationSec, text: s.text, request_id: result.request_id, performance: result.performance, language: result.language });
      }
      const cues = effectItems.map(s => ({
        fileId: s.asset_id, kind: s.type, atSec: s.at_sec, durationSec: s.duration_sec,
        gain: s.gain, pan: s.pan, distanceMeters: s.distance_meters,
        fadeInSec: s.fade_in_sec, fadeOutSec: s.fade_out_sec, loop: s.loop,
      }));
      const mix = mixSoundscape({
        voiceSegments, totalDurationSec: duration_sec, assets: loadedAssets, cues,
        voiceGain: args.voice_gain, ambienceBusGain: args.ambience_bus_gain,
        foleyBusGain: args.foley_bus_gain, masterGain: args.master_gain,
        duckingEnabled: args.ducking_enabled, duckingAmount: args.ducking_amount,
      });
      if (mix.buffer.length > 16 * 1024 * 1024) throw new Error("Mixed audio exceeds the 16 MB playback cache limit");
      const baseUrlValue = process.env.MCP_PUBLIC_BASE_URL || process.env.ZEABUR_WEB_URL;
      if (!baseUrlValue) throw new Error("MCP_PUBLIC_BASE_URL must be configured");
      const baseUrl = new URL(baseUrlValue);
      if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) throw new Error("MCP_PUBLIC_BASE_URL must use HTTPS");
      if (baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) throw new Error("MCP_PUBLIC_BASE_URL must contain only the public origin");

      const now = Date.now();
      for (const [id, item] of generatedAudioCache) if (item.expiresAt <= now) generatedAudioCache.delete(id);
      while (generatedAudioCache.size >= GENERATED_AUDIO_MAX_ITEMS ||
        [...generatedAudioCache.values()].reduce((sum, item) => sum + item.buffer.length, 0) + mix.buffer.length > GENERATED_AUDIO_MAX_BYTES) {
        const oldestId = generatedAudioCache.keys().next().value;
        if (!oldestId) break;
        generatedAudioCache.delete(oldestId);
      }
      const audioId = crypto.randomUUID();
      generatedAudioCache.set(audioId, { buffer: mix.buffer, expiresAt: now + GENERATED_AUDIO_TTL_MS });
      const recording = args.save_recording ? await recordingStore.save({
        buffer: mix.buffer, text: voiceItems.map(s => s.text).join(" / "),
        performance: "timeline", language: "auto", source: "render_audio_timeline",
        cues: mix.timeline.cues.map(cue => ({ asset_id: cue.fileId, kind: cue.kind, at_sec: cue.atSec, duration_sec: cue.durationSec })),
      }) : null;
      return {
        content: [{ type: "text", text: `${BOT_NAME}: timeline render ready (${duration_sec}s)` }],
        structuredContent: {
          audio_url: new URL(`/audio/${audioId}`, baseUrl.origin).toString(),
          audio_mime_type: "audio/wav", duration_sec: mix.durationSec,
          sample_rate: mix.sampleRate, channels: mix.channels,
          voice_segments: voiceMetadata,
          effects_segments: mix.timeline.cues.map(cue => ({ asset_id: cue.fileId, kind: cue.kind, at_sec: cue.atSec, duration_sec: cue.durationSec })),
          gaps: segments.filter(s => s.type === "gap").map(s => ({ at_sec: s.at_sec, duration_sec: s.duration_sec })),
          limiter_gain: Number(mix.limiterGain.toFixed(4)),
          ...(recording ? { recording_id: recording.id, recording_saved: true } : { recording_saved: false }),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: "Timeline render failed: " + message }], structuredContent: { error: message }, isError: true };
    }
  });


  }

  return mcp;
}

app.all("/mcp", async (req, res) => {
  const mcp = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void mcp.close();
  });

  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp]", error);
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

app.get("/audio/:id", (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).end();
  const item = generatedAudioCache.get(id);
  if (!item || item.expiresAt <= Date.now()) {
    generatedAudioCache.delete(id);
    return res.status(404).json({ error: "Audio preview expired" });
  }

  const totalLength = item.buffer.length;
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The MCP player runs in a cross-origin app frame; make media responses
  // explicitly usable by the embedded audio element.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  let range;
  try {
    range = parseByteRange(req.headers.range, totalLength);
  } catch {
    res.setHeader("Content-Range", `bytes */${totalLength}`);
    return res.status(416).end();
  }

  if (!range) {
    res.setHeader("Content-Length", String(totalLength));
    return res.status(200).send(item.buffer);
  }

  res.status(206);
  res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${totalLength}`);
  res.setHeader("Content-Length", String(range.length));
  return res.send(item.buffer.subarray(range.start, range.end + 1));
});

app.get("/assets", async (_req, res) => {
  try {
    const [assets, usage] = await Promise.all([audioAssetStore.list(), audioAssetStore.getUsage()]);
    res.json({ assets, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

app.delete("/assets/:id", async (req, res) => {
  try {
    const deleted = await audioAssetStore.remove(req.params.id);
    return deleted ? res.status(204).end() : res.status(404).json({ error: "Audio asset not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});


app.post(
  "/recordings",
  express.raw({ type: ["audio/wav", "audio/x-wav"], limit: Number(process.env.RECORDING_MAX_BYTES || 64 * 1024 * 1024) }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(415).json({ error: "Upload a WAV file with Content-Type: audio/wav" });
    }
    try {
      const recording = await recordingStore.save({
        buffer: req.body,
        text: req.get("x-recording-text") || "Imported recording (private archive verification)",
        performance: req.get("x-recording-performance") || "imported",
        language: req.get("x-recording-language") || "auto",
        source: "private_http_import",
      });
      return res.status(201).json({ recording });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = /file size limit|storage limit|archive is full/.test(message) ? 413 : 400;
      return res.status(statusCode).json({ error: message });
    }
  },
);

app.get("/recordings-library", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.type("html").send(recordingsPreviewHtml());
});

app.get("/recordings", async (_req, res) => {
  try {
    const [recordings, usage] = await Promise.all([recordingStore.list(), recordingStore.getUsage()]);
    return res.json({ recordings, usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

app.patch("/recordings/:id", express.json({ limit: "8kb" }), async (req, res) => {
  try {
    const metadata = await recordingStore.update(req.params.id, req.body);
    if (!metadata) return res.status(404).json({ error: "Recording not found" });
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.json({ recording: metadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: message });
  }
});

app.get("/recordings/:id", async (req, res) => {
  try {
    const item = await recordingStore.get(req.params.id);
    if (!item) return res.status(404).json({ error: "Recording not found" });
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(item.buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="${item.metadata.fileName}"`);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(item.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

app.delete("/recordings/:id", async (req, res) => {
  try {
    const deleted = await recordingStore.remove(req.params.id);
    return deleted ? res.status(204).end() : res.status(404).json({ error: "Recording not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message });
  }
});

app.get("/status", (_req, res) => {
  res.json({
    status: "ok",
    service: "voice-mcp",
    version: VERSION,
    runtime: "node",
    provider: "elevenlabs",
    model_id: MODEL_ID,
    configured: Boolean(process.env.ELEVENLABS_API_KEY && (process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID_ZH || process.env.ELEVENLABS_VOICE_ID_JA || process.env.ELEVENLABS_VOICE_ID_EN || process.env.ELEVENLABS_VOICE_ID_KO)),
    bot_name: BOT_NAME,
    features: {
      free_direction: true,
      performance_engine: true,
      performance_modes: ["auto", "natural", "soft", "close", "breathy", "expressive"],
      tag_guard: true,
      restrained_breath_planner: true,
      continuity_context: true,
      request_id_continuity: true,
      language_auto_detection: true,
      japanese_text_normalization_opt_in: true,
      local_drama_preview: true,
      private_audio_asset_library: true,
      persistent_recording_archive: true,
      mcp_apps_audio_player: true,
      soundscape_mcp_enabled: SOUNDSCAPE_MCP_ENABLED,
      speak_with_soundscape: SOUNDSCAPE_MCP_ENABLED,
      soundscape_max_seconds: MAX_SOUND_SCAPE_SECONDS,
      character_alignment: true,
      continuous_voice_timeline: SOUNDSCAPE_MCP_ENABLED,
      voice_chunk_planning: true,
      speak_long: true,
      long_voice_max_seconds: MAX_LONG_VOICE_SECONDS,
      character_alignment_qa: SOUNDSCAPE_MCP_ENABLED,
      legacy_style_presets: true,
      inline_audio_tags: true,
    },
  });
});

app.get("/events/latest", (req, res) => {
  if (!latestEvent || latestEvent.id === req.query.since) return res.json({ event: null });
  res.json({ event: latestEvent });
});

app.get("/speak", async (req, res) => {
  try {
    const text = String(req.query.text || "");
    if (!text.trim() || text.length > 4000) {
      return res.status(400).json({ error: "text must be 1–4000 characters" });
    }
    const style = req.query.style ? String(req.query.style) : undefined;
    const performance = req.query.performance ? String(req.query.performance) : undefined;
    const language = req.query.language ? String(req.query.language) : undefined;
    const direction = req.query.direction ? String(req.query.direction) : undefined;
    const previousText = req.query.previous_text ? String(req.query.previous_text) : undefined;
    const nextText = req.query.next_text ? String(req.query.next_text) : undefined;
    const rawTags = req.query.raw_tags === undefined
      ? undefined
      : String(req.query.raw_tags).toLowerCase() === "true";
    const previousRequestIds = req.query.previous_request_ids
      ? String(req.query.previous_request_ids).split(",").map((id) => id.trim()).filter(Boolean).slice(-3)
      : undefined;

    const result = await synthesize(text, {
      style,
      performance,
      language,
      direction,
      previousRequestIds,
      previousText,
      nextText,
      rawTags,
    });

    const audio = Buffer.from(result.audio_base64, "base64");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    if (Number.isInteger(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
    }
    res.status(statusCode).json({ error: message });
  }
});

// POST keeps the spoken text out of URL logs and browser history.
// HTTP access is gated by PRIVATE_DRAMA_ACCESS_TOKEN above. The separate /mcp
// connector route remains unauthenticated for compatibility with the existing setup.
app.post("/speak", async (req, res) => {
  const text = req.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return res.status(400).json({ error: "text must be 1–4000 characters" });
  }
  try {
    const result = await synthesize(text, {
      performance: req.body?.performance,
      language: req.body?.language,
      direction: req.body?.direction,
    });
    const audio = Buffer.from(result.audio_base64, "base64");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.send(audio);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// Experimental, local-only multitrack sound lab. Does not accept file uploads.
app.get("/drama-preview", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(dramaPreviewHtml());
});

app.get("/drama/timeline.mjs", async (_req, res) => {
  try {
    const code = await readFile(new URL("./drama-timeline.mjs", import.meta.url), "utf8");
    res.setHeader("Cache-Control", "no-store");
    res.type("text/javascript").send(code);
  } catch (error) {
    console.error("[drama-timeline]", error);
    res.status(500).type("text/plain").send("Timeline module unavailable");
  }
});

app.get("/panel", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BOT_NAME} Voice</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:720px;margin:40px auto;padding:0 18px;background:#111;color:#eee}textarea,input{width:100%;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444}textarea{min-height:110px;margin-top:12px}input{margin-top:12px}button{margin-top:12px;padding:10px 16px;border:0;border-radius:999px}audio{width:100%;margin-top:20px}.hint{opacity:.65;font-size:13px;line-height:1.5}.context{min-height:70px}</style></head><body><h1>${BOT_NAME} Voice</h1><p>voice-mcp ${VERSION} · performance engine + continuity context</p><textarea id="t" placeholder="这一段真正要说的话"></textarea><select id="pm" style="width:100%;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444;margin-top:12px"><option value="auto">auto / natural</option><option value="soft">soft</option><option value="close">close</option><option value="breathy">breathy</option><option value="expressive">expressive</option></select><select id="lg" style="width:100%;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444;margin-top:12px"><option value="auto">language / auto</option><option value="zh">中文</option><option value="ja">日本語</option><option value="en">English</option><option value="ko">한국어</option></select><input id="d" placeholder="高级声线覆盖（可选），例如：low and close, quiet, unhurried"><textarea class="context" id="p" placeholder="上一段文字（可选，只用于语气衔接，不会重复念）"></textarea><textarea class="context" id="n" placeholder="下一段文字（可选，只用于语气衔接，不会提前念）"></textarea><p class="hint">previous / next 只作为 ElevenLabs 的韵律上下文。它们不会出现在这一段音频里。</p><button id="g">生成声音</button><div id="s"></div><audio id="a" controls></audio><script>g.onclick=async()=>{s.textContent="Generating...";const q=new URLSearchParams({text:t.value,performance:pm.value,language:lg.value});if(d.value.trim())q.set("direction",d.value.trim());if(p.value.trim())q.set("previous_text",p.value.trim());if(n.value.trim())q.set("next_text",n.value.trim());const r=await fetch("/speak?"+q.toString());if(!r.ok){s.textContent=await r.text();return}a.src=URL.createObjectURL(await r.blob());s.textContent="Ready";await a.play().catch(()=>{})}</script></body></html>`);
});

app.get("/", (_req, res) => {
  res.type("html").send(`<h1>voice-mcp</h1><p>Node runtime is online.</p><p>Version: ${VERSION}</p><p><a href="/status">/status</a> · <a href="/panel">/panel</a> · <a href="/drama-preview">/drama-preview</a> · MCP: <code>/mcp</code></p>`);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[voice-mcp] v${VERSION} listening on ${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
