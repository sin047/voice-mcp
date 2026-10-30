import express from "express";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  buildVoiceSettings,
  createPerformancePlan,
  getVoiceIdForLanguage,
  normalizeDirection,
  normalizePerformance,
  shouldApplyJapaneseNormalization,
  stripAudioTags,
} from "./performance.mjs";

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const BOT_NAME = process.env.BOT_NAME || "AI";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
const PLAYER_URI = "ui://voice-mcp/player.html";
const PLAYER_MIME = "text/html;profile=mcp-app";
const VERSION = "1.3.0";
const MAX_CONTEXT_CHARS = 4000;

let latestEvent = null;
const recentPerformancePatterns = [];



const cors = (_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-ID");
  if (_req.method === "OPTIONS") return res.status(204).end();
  next();
};
app.use(cors);

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


function buildText(text, style, rawTags, direction, performance) {
  const supportsTags = ["eleven_v3", "eleven_v4", "eleven_v4_turbo"].includes(MODEL_ID);
  if (!supportsTags) {
    return {
      finalText: stripAudioTags(text),
      plan: {
        requested_mode: normalizePerformance(performance),
        mode: "natural",
        direction: null,
        legacy_tag: null,
        breath_event: null,
        rendered_text: stripAudioTags(text),
        raw_tags_preserved: false,
      },
    };
  }

  const plan = createPerformancePlan(text, { performance, direction, style, rawTags, recentPatterns: recentPerformancePatterns });
  const tag = plan.direction ? `[${plan.direction}]` : plan.legacy_tag;
  const finalText = tag ? `${tag} ${plan.rendered_text}` : plan.rendered_text;

  return { finalText, plan };
}

async function synthesize(text, options = {}) {
  const {
    style,
    rawTags,
    direction,
    performance,
    language,
    previousText,
    nextText,
    previousRequestIds,
    includeAlignment,
  } = options;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceSelection = getVoiceIdForLanguage(text, language);
  const voiceId = voiceSelection.voiceId;
  const detectedLanguage = voiceSelection.language;

  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not configured");

  const built = buildText(text, style, rawTags, direction, performance);
  const finalText = built.finalText;
  const performancePlan = built.plan;
  if (!stripAudioTags(finalText)) throw new Error("No speakable text");

  const previousContext = normalizeContext(previousText, "previous_text");
  const nextContext = normalizeContext(nextText, "next_text");

  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`);
  url.searchParams.set("output_format", OUTPUT_FORMAT);

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

  const response = await fetch(url, {
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

  const requestId = response.headers.get("request-id") || response.headers.get("Request-Id") || null;
  const data = await response.json();
  if (!data.audio_base64) throw new Error("ElevenLabs returned no audio");

  latestEvent = {
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
    previous_text: previousContext,
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
.row{display:flex;align-items:center;gap:10px}
button{width:38px;height:38px;border:0;border-radius:999px;font-size:17px;cursor:pointer}
.name{font-size:13px;opacity:.62}.text{font-size:14px;line-height:1.5;margin-top:8px;white-space:pre-wrap}
@media(prefers-color-scheme:dark){body{color:#eee}.card{background:rgba(36,36,36,.94)}}
</style>
</head>
<body>
<div class="card"><div class="row"><button id="play">▶</button><div><div class="name" id="name"></div><div id="state">Ready</div></div></div><div class="text" id="text"></div><audio id="audio"></audio></div>
<script>
const BOT_NAME=${safeBot};
const VERSION=${safeVersion};
const play=document.getElementById("play"),audio=document.getElementById("audio"),text=document.getElementById("text"),state=document.getElementById("state");
document.getElementById("name").textContent=BOT_NAME;
function apply(data){
  if(!data)return;
  if(data.error){state.textContent=data.error;return;}
  if(data.text)text.textContent=data.text;
  if(data.audio_base64){audio.src="data:audio/mpeg;base64,"+data.audio_base64;state.textContent="Tap to play";}
}
window.addEventListener("message",(event)=>{
 const msg=event.data;
 if(msg?.method==="ui/notifications/tool-result") apply(msg.params?.structuredContent);
 if(msg?.structuredContent) apply(msg.structuredContent);
});
play.onclick=async()=>{if(!audio.src)return;if(audio.paused){await audio.play();play.textContent="❚❚"}else{audio.pause();play.textContent="▶"}};
audio.onended=()=>play.textContent="▶";
function send(method,params,id){const m={jsonrpc:"2.0",method,params:params||{}};if(id!==undefined)m.id=id;window.parent.postMessage(m,"*")}
send("ui/initialize",{name:"voice-mcp",version:VERSION},1);
setTimeout(()=>send("ui/notifications/initialized",{}),50);
</script>
</body>
</html>`;
}

function createServer() {
  const mcp = new McpServer({ name: "voice-mcp", version: VERSION });

  mcp.server.registerCapabilities({
    extensions: { "io.modelcontextprotocol/ui": {} },
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
      description: `Make ${BOT_NAME} speak with the configured ElevenLabs voice. Use natural for everyday speech; soft/close for quieter delivery; breathy/expressive only when explicitly requested. Natural is intentionally untagged. Use language=auto unless the language is ambiguous. For adjacent chunks of the SAME voice and model, pass the request_id returned by the immediately preceding call in previous_request_ids (max 3) to improve continuity; otherwise use previous_text / next_text. The tool returns a request_id for the next contiguous chunk. direction is an advanced override; include_alignment is only for timing-aware audio work.`,
      inputSchema: z.object({
        text: z.string().min(1).describe("Text to speak"),
        performance: z.enum(["auto", "natural", "soft", "close", "breathy", "expressive"]).optional().describe("High-level delivery mode. Prefer natural for everyday speech. Use breathy/expressive only when context explicitly calls for stronger breath/performance. Defaults to auto/natural."),
        language: z.enum(["auto", "zh", "ja", "en", "ko"]).optional().describe("Language override. Auto-detects Japanese kana, Korean Hangul, Chinese Han characters and English; set explicitly for kanji-only Japanese or ambiguous mixed text."),
        direction: z.string().max(180).optional().describe("Advanced free-form English voice direction override, without square brackets. Prefer performance for normal GPT use."),
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
    async ({ text, performance, language, direction, previous_text, next_text, previous_request_ids, include_alignment, style, raw_tags }) => {
      try {
        const result = await synthesize(text, {
          performance,
          language,
          direction,
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
            performance: result.performance,
            direction: result.performance?.direction || normalizeDirection(direction) || null,
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
      character_alignment: true,
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
    res.status(500).json({ error: message });
  }
});

app.get("/panel", (_req, res) => {
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BOT_NAME} Voice</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:720px;margin:40px auto;padding:0 18px;background:#111;color:#eee}textarea,input{width:100%;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444}textarea{min-height:110px;margin-top:12px}input{margin-top:12px}button{margin-top:12px;padding:10px 16px;border:0;border-radius:999px}audio{width:100%;margin-top:20px}.hint{opacity:.65;font-size:13px;line-height:1.5}.context{min-height:70px}</style></head><body><h1>${BOT_NAME} Voice</h1><p>voice-mcp ${VERSION} · performance engine + continuity context</p><textarea id="t" placeholder="这一段真正要说的话"></textarea><select id="pm" style="width:100%;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444;margin-top:12px"><option value="auto">auto / natural</option><option value="soft">soft</option><option value="close">close</option><option value="breathy">breathy</option><option value="expressive">expressive</option></select><input id="d" placeholder="高级声线覆盖（可选），例如：low and close, quiet, unhurried"><textarea class="context" id="p" placeholder="上一段文字（可选，只用于语气衔接，不会重复念）"></textarea><textarea class="context" id="n" placeholder="下一段文字（可选，只用于语气衔接，不会提前念）"></textarea><p class="hint">previous / next 只作为 ElevenLabs 的韵律上下文。它们不会出现在这一段音频里。</p><button id="g">生成声音</button><div id="s"></div><audio id="a" controls></audio><script>g.onclick=async()=>{s.textContent="Generating...";const q=new URLSearchParams({text:t.value,performance:pm.value});if(d.value.trim())q.set("direction",d.value.trim());if(p.value.trim())q.set("previous_text",p.value.trim());if(n.value.trim())q.set("next_text",n.value.trim());const r=await fetch("/speak?"+q.toString());if(!r.ok){s.textContent=await r.text();return}a.src=URL.createObjectURL(await r.blob());s.textContent="Ready";await a.play().catch(()=>{})}</script></body></html>`);
});

app.get("/", (_req, res) => {
  res.type("html").send(`<h1>voice-mcp</h1><p>Node runtime is online.</p><p>Version: ${VERSION}</p><p><a href="/status">/status</a> · <a href="/panel">/panel</a> · MCP: <code>/mcp</code></p>`);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[voice-mcp] v${VERSION} listening on 0.0.0.0:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
