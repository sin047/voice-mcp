import express from "express";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
app.use(express.json({ limit: "20mb" }));

const PORT = Number.parseInt(process.env.PORT || "8080", 10);
const BOT_NAME = process.env.BOT_NAME || "AI";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_v4";
const OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
const PLAYER_URI = "ui://voice-mcp/player.html";
const PLAYER_MIME = "text/html;profile=mcp-app";

let latestEvent = null;

const styleTags = {
  soft: "[whispers]",
  teasing: "[mischievously]",
  excited: "[excited]",
  tired: "[sighs]",
  laughing: "[laughs]",
  curious: "[curious]",
};

const cors = (_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id, Last-Event-ID");
  if (_req.method === "OPTIONS") return res.status(204).end();
  next();
};
app.use(cors);

function stripTags(text) {
  return text.replace(/\[[A-Za-z][A-Za-z _-]*\]/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

function hasTags(text) {
  return stripTags(text) !== text.trim();
}

function getVoiceId(text) {
  const isZh = /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
  if (isZh) return process.env.ELEVENLABS_VOICE_ID_ZH || process.env.ELEVENLABS_VOICE_ID;
  return process.env.ELEVENLABS_VOICE_ID_EN || process.env.ELEVENLABS_VOICE_ID;
}

function buildText(text, style, rawTags) {
  if (!["eleven_v3", "eleven_v4", "eleven_v4_turbo"].includes(MODEL_ID)) return stripTags(text);
  if (rawTags === true || (rawTags === undefined && hasTags(text))) return text;
  const clean = stripTags(text);
  const tag = style ? styleTags[String(style).toLowerCase()] : undefined;
  return tag ? `${tag} ${clean}` : clean;
}

function voiceSettings() {
  const settings = {};
  const stability = Number(process.env.ELEVENLABS_STABILITY);
  const similarity = Number(process.env.ELEVENLABS_SIMILARITY_BOOST);
  if (Number.isFinite(stability)) settings.stability = stability;
  if (Number.isFinite(similarity)) settings.similarity_boost = similarity;
  return settings;
}

async function synthesize(text, style, rawTags) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = getVoiceId(text);
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not configured");

  const finalText = buildText(text, style, rawTags);
  if (!stripTags(finalText)) throw new Error("No speakable text");

  const url = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps`);
  url.searchParams.set("output_format", OUTPUT_FORMAT);

  const body = {
    text: finalText,
    model_id: MODEL_ID,
    voice_settings: voiceSettings(),
  };

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

  const data = await response.json();
  if (!data.audio_base64) throw new Error("ElevenLabs returned no audio");

  latestEvent = {
    id: crypto.randomUUID(),
    text,
    audio_base64: data.audio_base64,
    created_at: new Date().toISOString(),
    style: style || null,
  };

  return { audio_base64: data.audio_base64, final_text: finalText };
}

function playerHtml() {
  const safeBot = JSON.stringify(BOT_NAME);
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
send("ui/initialize",{name:"voice-mcp",version:"1.0.0"},1);
setTimeout(()=>send("ui/notifications/initialized",{}),50);
</script>
</body>
</html>`;
}

function createServer() {
  const mcp = new McpServer({ name: "voice-mcp", version: "1.0.0" });

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
      description: `Make ${BOT_NAME} speak with the configured ElevenLabs voice.`,
      inputSchema: z.object({
        text: z.string().min(1).describe("Text to speak"),
        style: z.string().optional().describe("soft, teasing, excited, tired, laughing, or curious"),
        raw_tags: z.boolean().optional().describe("Preserve ElevenLabs audio tags"),
      }),
      _meta: {
        ui: { resourceUri: PLAYER_URI },
        "ui/resourceUri": PLAYER_URI,
      },
    },
    async ({ text, style, raw_tags }) => {
      try {
        const result = await synthesize(text, style, raw_tags);
        return {
          content: [{ type: "text", text: `🎙️ ${BOT_NAME}: "${text}"` }],
          structuredContent: { text, audio_base64: result.audio_base64 },
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
    runtime: "node",
    provider: "elevenlabs",
    model_id: MODEL_ID,
    configured: Boolean(process.env.ELEVENLABS_API_KEY && (process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID_ZH || process.env.ELEVENLABS_VOICE_ID_EN)),
    bot_name: BOT_NAME,
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
    const result = await synthesize(text, style, undefined);
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
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BOT_NAME} Voice</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:720px;margin:40px auto;padding:0 18px;background:#111;color:#eee}textarea{width:100%;min-height:120px;box-sizing:border-box;border-radius:14px;padding:14px;background:#1c1c1c;color:#eee;border:1px solid #444}button{margin-top:12px;padding:10px 16px;border:0;border-radius:999px}audio{width:100%;margin-top:20px}</style></head><body><h1>${BOT_NAME} Voice</h1><p>Lightweight Zeabur Node runtime.</p><textarea id="t" placeholder="输入一句话"></textarea><br><button id="g">生成声音</button><div id="s"></div><audio id="a" controls></audio><script>g.onclick=async()=>{s.textContent="Generating...";const r=await fetch("/speak?text="+encodeURIComponent(t.value));if(!r.ok){s.textContent=await r.text();return}a.src=URL.createObjectURL(await r.blob());s.textContent="Ready";await a.play().catch(()=>{})}</script></body></html>`);
});

app.get("/", (_req, res) => {
  res.type("html").send(`<h1>voice-mcp</h1><p>Node runtime is online.</p><p><a href="/status">/status</a> · <a href="/panel">/panel</a> · MCP: <code>/mcp</code></p>`);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[voice-mcp] Node runtime listening on 0.0.0.0:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
