# Zeabur deployment

This branch keeps the original Cloudflare Worker implementation and runs it on Zeabur through Wrangler's local runtime.

## Required Zeabur variables

For ElevenLabs:

- `TTS_PROVIDER=elevenlabs`
- `ELEVENLABS_API_KEY=...`
- `ELEVENLABS_VOICE_ID=...`

Optional:

- `BOT_NAME=...`
- `ELEVENLABS_MODEL_ID=eleven_v4`
- `ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128`
- `ELEVENLABS_STABILITY=0.36`
- `ELEVENLABS_SIMILARITY_BOOST=0.75`

The start script copies the supported Zeabur environment variables into a local `.dev.vars` file at container startup so Wrangler exposes them to the Worker without committing secrets to GitHub.

## Endpoints

After deployment:

- `/status` — health/configuration check
- `/panel` — visualizer panel
- `/speak?text=Hello` — direct TTS test
- `/mcp` — MCP endpoint

Do not commit API keys to the repository.
