import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";

const port = process.env.PORT || "8080";

const supportedKeys = [
  "TTS_PROVIDER",
  "DASHSCOPE_API_KEY",
  "VOICE_ID",
  "TTS_MODEL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_VOICE_ID_ZH",
  "ELEVENLABS_VOICE_ID_EN",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_OUTPUT_FORMAT",
  "ELEVENLABS_LANGUAGE_CODE",
  "ELEVENLABS_LANGUAGE_CODE_ZH",
  "ELEVENLABS_LANGUAGE_CODE_EN",
  "ELEVENLABS_STABILITY",
  "ELEVENLABS_SIMILARITY_BOOST",
  "ELEVENLABS_STYLE",
  "ELEVENLABS_USE_SPEAKER_BOOST",
  "ELEVENLABS_SPEED",
  "BOT_NAME",
];

const env = {
  ...process.env,
  TTS_PROVIDER: process.env.TTS_PROVIDER || "elevenlabs",
};

const lines = [];
for (const key of supportedKeys) {
  const value = env[key];
  if (value !== undefined && value !== "") {
    lines.push(`${key}=${JSON.stringify(String(value))}`);
  }
}

await writeFile(".dev.vars", lines.join("\n") + "\n", { mode: 0o600 });

const missing = [];
if ((env.TTS_PROVIDER || "").toLowerCase() === "elevenlabs") {
  if (!env.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");
  if (!env.ELEVENLABS_VOICE_ID && !env.ELEVENLABS_VOICE_ID_ZH && !env.ELEVENLABS_VOICE_ID_EN) {
    missing.push("ELEVENLABS_VOICE_ID");
  }
}

if (missing.length) {
  console.warn(`[voice-mcp] Missing configuration: ${missing.join(", ")}`);
}

console.log(`[voice-mcp] Starting local Worker runtime on 0.0.0.0:${port}`);

const wrangler = process.platform === "win32"
  ? "node_modules/.bin/wrangler.cmd"
  : "node_modules/.bin/wrangler";

const child = spawn(
  wrangler,
  ["dev", "--ip", "0.0.0.0", "--port", port, "--log-level", "info"],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[voice-mcp] Wrangler exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
