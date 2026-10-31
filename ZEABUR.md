# Zeabur deployment · Shin Voice

Last verified against source: 2026-10-31  
Maintained branch: `zeabur`  
Current source version: `1.4.0-beta.17`

This service is a **Node.js / Express application**, not the former Cloudflare Worker + Wrangler runtime.

## Runtime

- Node.js 22+
- Express 5
- MCP SDK with Streamable HTTP transport
- Entrypoint: `src/server.mjs`
- Start command: `npm start` (`node src/server.mjs`)
- Listen address: `HOST` (defaults to `0.0.0.0`)
- Listen port: `PORT` (defaults to `8080`; use the platform-provided port when present)

The repository also includes a Dockerfile based on `node:22-bookworm-slim`. For a standard Zeabur Node.js deployment, use the repository's normal Node install/build detection and the start command above. Do not configure Wrangler, a Worker runtime, or generate `.dev.vars`.

## Git deployment

Configure the Zeabur service to deploy from:

- Repository: `sin047/voice-mcp`
- Branch: `zeabur`

The `zeabur` branch is the maintained development/deployment line. The repository default branch `main` and historical branch `voice-v1.4-private-drama` are not substitutes for it.

A GitHub Actions success only proves that the CI checks passed. After a push, separately verify that Zeabur completed its deployment and that `GET /status` reports the expected version.

## Required environment variables

### ElevenLabs

- `ELEVENLABS_API_KEY` — required; keep it only in Zeabur secrets/environment variables.
- `ELEVENLABS_VOICE_ID` — default/fallback ElevenLabs voice ID. The currently selected voice is configured in the service environment; do not put API credentials in Git.
- `ELEVENLABS_MODEL_ID` — optional; defaults to `eleven_v4`.
- `ELEVENLABS_OUTPUT_FORMAT` — optional; defaults to `mp3_44100_128`.
- `BOT_NAME` — optional; defaults to `AI`.

No OpenAI API key or OpenAI API dependency is required.

### Private HTTP routes and audio storage

- `PRIVATE_DRAMA_ACCESS_TOKEN` — configure a random secret of at least 32 characters. It protects the private preview, direct HTTP speech and asset-management routes.
- `AUDIO_ASSET_DIR` — optional; defaults to `./data/audio-assets` relative to the process working directory. Set this to the mount path of a persistent Zeabur Volume, for example `/app/data/audio-assets` when the service working directory is `/app`.
- `AUDIO_ASSET_MAX_BYTES` — optional; defaults to 20 MiB per WAV asset.
- `AUDIO_ASSET_MAX_COUNT` — optional; defaults to 100 assets.
- `AUDIO_ASSET_MAX_TOTAL_BYTES` — optional; defaults to 200 MiB total.

### Persistent recordings

- `RECORDING_DIR` — optional; defaults to `./data/recordings`. Mount this exact directory on a persistent Zeabur Volume, separately from `AUDIO_ASSET_DIR`.
- `RECORDING_MAX_BYTES` — optional; defaults to 64 MiB per recording.
- `RECORDING_MAX_COUNT` — optional; defaults to 500 recordings.
- `RECORDING_MAX_TOTAL_BYTES` — optional; defaults to 2 GiB total.

The `speak_with_soundscape` MCP tool accepts `save_recording: true` to persist the completed mixed WAV and metadata. It defaults to false. `GET /recordings` lists metadata and storage usage; `PATCH /recordings/:id` edits the title, up to 12 tags and favorite status; `GET /recordings/:id` downloads a WAV; `DELETE /recordings/:id` deletes one. These routes use the private HTTP token. This archive is persistent storage, not a backup: export or copy the Volume contents to an independent backup location regularly.

Mount the persistent Volume at the exact directory configured by `AUDIO_ASSET_DIR`. Without persistent storage, uploaded WAV assets can be lost when the container is replaced.

### Playback URL

- `MCP_PUBLIC_BASE_URL` — recommended for soundscape playback. Set it to the public HTTPS origin only, e.g. `https://your-service.zeabur.app`; do not append `/mcp`, another path, query string or fragment.
- If this variable is absent, the server falls back to Zeabur's injected `ZEABUR_WEB_URL`. The resolved public origin must use HTTPS.

Soundscape playback returns a temporary WAV URL. The generated audio cache is in process memory, the default link lifetime is about 10 minutes, and a service restart invalidates existing links.

### MCP soundscape tools and usage limits

- `MCP_SOUNDSCAPE_TOOLS_ENABLED` defaults to `false`. Keep it false unless access to `/mcp` has first been restricted by a verified private ingress, firewall/IP allowlist or equivalent access layer.
- `MCP_MAX_REQUESTS_PER_MINUTE` defaults to 120.
- `VOICE_MAX_BILLABLE_CHARS_PER_REQUEST` defaults to 4200.
- `VOICE_MAX_CALLS_PER_MINUTE` defaults to 8.
- `VOICE_MAX_CALLS_PER_DAY` defaults to 120.
- `VOICE_MAX_CHARS_PER_DAY` defaults to 12000.
- `VOICE_MAX_CONCURRENT_SYNTHESIS` defaults to 2.

Usage counters and generated-audio cache are process-local. They are not shared between replicas and reset on restart.

## Endpoints

| Endpoint | Purpose | Access |
| --- | --- | --- |
| `GET /status` | Health, version and feature status | Public |
| `POST /mcp` | Streamable HTTP MCP endpoint | No OAuth/authentication currently |
| `GET /drama-preview` | Private soundscape preview UI | Private HTTP token |
| `GET /recordings-library` | Private recording archive UI | Private HTTP token |
| `PATCH /recordings/:id` | Edit recording title, tags and favorite status | Private HTTP token |
| `GET /speak`, `POST /speak` | Direct HTTP speech preview | Private HTTP token |
| `GET /assets`, `POST /assets`, `DELETE /assets/:id` | Private WAV asset management | Private HTTP token |
| `GET /audio/:id` | Temporary generated soundscape playback | Short-lived unguessable URL |
| `GET /panel` | Audio/player panel | Private HTTP token |
| `GET /events/latest` | Latest preview event | Private HTTP token |

For browser Basic Auth, use username `voice-mcp` and the configured `PRIVATE_DRAMA_ACCESS_TOKEN` as the password. Script clients may use the token as a Bearer credential.

## Security notes

- The private HTTP token does **not** authenticate the MCP `/mcp` endpoint.
- The current MCP endpoint has no OAuth and no caller identity. Rate limiting is a spend/abuse guardrail, not authentication.
- Do not enable `MCP_SOUNDSCAPE_TOOLS_ENABLED` on an unrestricted public MCP endpoint.
- Never commit ElevenLabs API keys, private access tokens, uploaded WAV files or other private audio assets.
- OAuth is intentionally deferred; do not change the existing ChatGPT MCP connection or transport as part of routine voice-performance tuning.

## Post-deployment verification

After every code deployment:

1. Confirm the latest GitHub Actions run for `zeabur` is successful.
2. Confirm Zeabur reports the deployment as complete.
3. Open `GET /status` and verify `status: "ok"` and `version: "1.4.0-beta.17"` (or the new expected version).
4. Make one real call through the existing `voice2-v1.3.1` MCP connection.
5. For soundscape playback, verify the expected private assets exist and that the returned temporary WAV URL plays.

Do not treat a successful CI run as proof that the live Zeabur deployment succeeded.


For a one-time persistence check, an authorized client may upload a WAV to `POST /recordings` using `Content-Type: audio/wav`. This endpoint is protected by the private HTTP token and stores the WAV with import metadata. It is intended for archive verification/import; it does not expose the MCP soundscape tools or bypass the disabled-by-default MCP security gate.
