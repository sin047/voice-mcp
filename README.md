# voice-mcp

A platform-neutral Node.js MCP server for ElevenLabs voice generation, expressive delivery and mixed voice + sound-effect playback.

The experimental runtime is designed to run on a VPS, Docker host or another Node-compatible platform. It does not depend on Zeabur APIs.

## Branches

- `zeabur`: existing stable v1.3.1 ChatGPT MCP deployment. This branch is not changed by the experimental work.
- `voice-v1.4-private-drama`: experimental v1.4 audio engine, private sound library and soundscape MCP tools. Keep it separate until deployment and real-device acceptance tests pass.

## Use directly in ChatGPT desktop (Windows)

This experimental branch can run entirely on your own PC. No Zeabur, VPS, public tunnel or OAuth is needed for this local setup.

1. Clone this branch and install dependencies:
   ```powershell
   git clone --branch voice-v1.4-private-drama https://github.com/sin047/voice-mcp.git
   cd voice-mcp
   npm install
   Copy-Item .env.example .env
   ```
2. Edit `.env`: add your ElevenLabs API key, keep the configured voice ID, and set a private local token. The example already binds the server to `127.0.0.1` and enables the soundscape tools.
3. Put the curated audio asset bundle's `data/audio-assets` folder into this repository's `data/audio-assets` directory.
4. Start the local server:
   ```powershell
   npm run desktop
   ```
5. In ChatGPT desktop, open **Settings → MCP servers → Add server**, choose **Streamable HTTP**, and enter `http://127.0.0.1:8765/mcp`. Save, then select **Restart**. Type `/mcp` in the composer to confirm the tools are available.

The local configuration uses `HOST=127.0.0.1`, so the unauthenticated MCP endpoint is reachable only from this PC. Do not change it to `0.0.0.0` or expose port 8765 publicly for this no-OAuth test. The private browser preview and asset management routes still use Basic Auth.

## Runtime

Requirements: Node.js 22+.

```bash
npm install
npm start
```

The server listens on `PORT` (default `8080`). The canonical entrypoint is `src/server.mjs`; `src/zeabur-server.mjs` remains only as a backward-compatible import shim.

Docker:

```bash
docker build -t voice-mcp .
docker run --rm -p 8080:8080 \
  -e ELEVENLABS_API_KEY=... \
  -e ELEVENLABS_VOICE_ID=... \
  -e PRIVATE_DRAMA_ACCESS_TOKEN=... \
  -e MCP_PUBLIC_BASE_URL=https://voice.example.com \
  -v voice-mcp-data:/app/data \
  voice-mcp
```

Mount persistent storage at the configured `AUDIO_ASSET_DIR` (default `/app/data/audio-assets` when the working directory is `/app`). Without a persistent volume, uploaded assets are lost when an ephemeral container is replaced.

## MCP tools

The existing `speak` tool remains available. The private asset tools `list_sound_assets` and `speak_with_soundscape` are **disabled by default**. Set `MCP_SOUNDSCAPE_TOOLS_ENABLED=true` only after restricting `/mcp` through private ingress, a firewall/IP allowlist or another verified access layer. The direct-URL connector does not authenticate callers; do not expose private asset IDs through an unrestricted public endpoint.

### `speak`

Generate a voice clip with the configured ElevenLabs voice. Supports performance modes (`natural`, `soft`, `close`, `breathy`, `expressive`), language selection and request stitching.

For the already-installed mobile `voice2-v1.3.1` app, soundscapes are backward-compatible through the existing `direction` parameter; no new mobile MCP connection is required. Prefix `direction` with one of these markers:

- `[soundscape:rain]` — quiet looping rain ambience
- `[soundscape:desk]` — keyboard ambience
- `[soundscape:package]` — packaging / unboxing Foley
- `[soundscape:close]` — subtle close-detail Foley
- `[soundscape:intimate]` — layered adult/intimate Foley

The marker is stripped before the direction reaches ElevenLabs. Omit the marker for the original voice-only MP3 path. Soundscape playback uses a temporary WAV URL and requires the curated assets plus `MCP_PUBLIC_BASE_URL`.

### `list_sound_assets`

List the WAV assets that have been explicitly uploaded to this server's private audio library. Use this tool to retrieve `asset_id` values.

### `speak_with_soundscape`

Generate speech and mix it with up to 12 uploaded ambience/Foley assets. The tool returns a short-lived audio URL which the inline MCP player can play.

- Voice remains centered.
- Mono effects support timing, gain, left/right pan and distance attenuation.
- Stereo effects retain their recorded stereo image.
- Ambience and Foley have independent buses.
- Voice-priority ducking gently lowers effects while speech is present.
- Output is a stereo WAV, limited to 60 seconds.
- The server-side mix uses stereo panning, not browser HRTF.

The generated playback URL expires after 10 minutes and is held in process memory; a server restart invalidates it. The URL is an unguessable, temporary bearer link.

## Private sound library

1. Configure `PRIVATE_DRAMA_ACCESS_TOKEN` with a random secret of at least 32 characters.
2. Configure `MCP_PUBLIC_BASE_URL` as the public HTTPS origin, for example `https://voice.example.com` (no path).
3. Open `/drama-preview` and complete the browser Basic Auth prompt. Username: `voice-mcp`; password: the access token.
4. Select local sound files. They remain in the browser until you explicitly click **保存到音效库**.
5. The preview converts supported browser audio files to PCM WAV before uploading. The server accepts mono/stereo 16-bit PCM or 32-bit float WAV assets.
6. After restricting `/mcp` access and explicitly enabling `MCP_SOUNDSCAPE_TOOLS_ENABLED=true`, call `list_sound_assets` in ChatGPT to discover asset IDs, then call `speak_with_soundscape`.

The private HTTP token protects `/drama-preview`, `/drama/timeline.mjs`, `/speak`, `/panel`, `/events/latest` and `/assets`. It does **not** authenticate the MCP `/mcp` endpoint.

## Environment variables

### Voice

| Variable | Default | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | — | Required ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | — | Default/fallback voice ID |
| `ELEVENLABS_VOICE_ID_ZH` | — | Optional Chinese voice |
| `ELEVENLABS_VOICE_ID_JA` | — | Optional Japanese voice |
| `ELEVENLABS_VOICE_ID_EN` | — | Optional English voice |
| `ELEVENLABS_VOICE_ID_KO` | — | Optional Korean voice |
| `ELEVENLABS_MODEL_ID` | `eleven_v4` | TTS model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Format for ordinary `speak` playback |
| `BOT_NAME` | `AI` | Player/tool display name |
| `PORT` | `8080` | HTTP listen port |

The soundscape path requests `pcm_24000` internally, then resamples and mixes to 44.1 kHz stereo WAV. This avoids requiring the 44.1 kHz PCM output tier for the mixing path.

### Storage and playback

| Variable | Default | Description |
|---|---:|---|
| `AUDIO_ASSET_DIR` | `./data/audio-assets` | Persistent audio asset directory |
| `AUDIO_ASSET_MAX_BYTES` | 20 MiB | Maximum bytes per uploaded WAV |
| `AUDIO_ASSET_MAX_COUNT` | 100 | Maximum number of stored assets |
| `AUDIO_ASSET_MAX_TOTAL_BYTES` | 200 MiB | Total audio library storage ceiling |
| `MCP_PUBLIC_BASE_URL` | — | Required public HTTPS origin used to create playable soundscape URLs |
| `MCP_SOUNDSCAPE_TOOLS_ENABLED` | `false` | Explicit opt-in for `list_sound_assets` and `speak_with_soundscape`; enable only after `/mcp` access is restricted |

### Request and ElevenLabs usage limits

| Variable | Default | Description |
|---|---:|---|
| `PRIVATE_DRAMA_ACCESS_TOKEN` | — | Required for private HTTP routes; random secret, minimum 32 characters |
| `MCP_MAX_REQUESTS_PER_MINUTE` | 120 | Process-wide HTTP requests to `/mcp` per minute |
| `VOICE_MAX_BILLABLE_CHARS_PER_REQUEST` | 4200 | Maximum final text sent to ElevenLabs per generation |
| `VOICE_MAX_CALLS_PER_MINUTE` | 8 | ElevenLabs attempts per minute |
| `VOICE_MAX_CALLS_PER_DAY` | 120 | ElevenLabs attempts per UTC day |
| `VOICE_MAX_CHARS_PER_DAY` | 12000 | Final text characters sent to ElevenLabs per UTC day |
| `VOICE_MAX_CONCURRENT_SYNTHESIS` | 2 | Concurrent ElevenLabs generations |

The rate and usage counters are process-local, shared across callers on one process, and reset on restart. They are spend/abuse guardrails, not caller identity or durable billing records. Use a shared store such as Redis if the service later runs multiple replicas.

## Security status

OAuth is intentionally deferred while the deployment target is still undecided. The current direct-URL ChatGPT connector remains compatible, so `/mcp` is still unauthenticated. Rate limits reduce accidental spend but do not authenticate the caller. Do not expose this experimental MCP endpoint as a public service until OAuth 2.1 or another verified client/network access strategy is implemented.

Private browser/HTTP routes fail closed if the private access token is missing or weak. Never commit access tokens, ElevenLabs keys or private sound files to GitHub.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /mcp` | Streamable HTTP MCP endpoint |
| `GET /status` | Health and feature status |
| `GET /drama-preview` | Private multitrack audio preview |
| `GET /assets` | Private sound library listing |
| `POST /assets` | Upload one WAV asset |
| `DELETE /assets/:id` | Delete a stored asset |
| `GET /audio/:id` | Short-lived generated soundscape playback |
| `GET /speak`, `POST /speak` | Private direct speech preview |

## Development and tests

```bash
npm test
```

The tests cover performance planning, cue validation, authentication, usage limits, WAV decoding/encoding, audio mixing and persistent asset storage.

## License

MIT. This fork preserves the upstream license from [garan0613/voice-mcp](https://github.com/garan0613/voice-mcp).
