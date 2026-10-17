# Audio providers

OhMyGame treats audio as a capability family rather than a TTS-only feature. The shared contract has four operations:

- `speech` for narration and character voices;
- `dialogue` for multi-speaker synthesis when a provider supports it;
- `sound-effect` for prompted effects and ambience;
- `music` for instrumental or lyrical music.

The daemon owns credentials, provider calls, generated files, and Library registration. The renderer and agents submit provider-neutral requests and never receive saved API keys.

## Architecture

`src/shared/audio.ts` defines requests, output settings, model capabilities, catalogs, and generated-audio metadata. A provider adapter implements `AudioProviderAdapter`; `ProviderAudio` selects only a configured, enabled model that advertises the requested operation. `ToolRunner` then persists MP3 or WAV output through the same job and Library flow used by image, video, and 3D generation.

The stable tool boundary is:

| Tool                    | Operation      | Current implementation                     |
| ----------------------- | -------------- | ------------------------------------------ |
| `generate-speech`       | `speech`       | Volcengine Doubao Speech synthesis 2.0     |
| `generate-sound-effect` | `sound-effect` | Contract ready; needs a compatible adapter |
| `generate-music`        | `music`        | Suno through the standalone MuMu connection |

Unsupported operations fail before an incompatible provider is called. Adding ElevenLabs, MiniMax, Suno, Gemini, Fish Audio, or SiliconFlow should normally require a new adapter and settings integration, not changes to jobs or Library storage.

## Asset Canvas audio nodes

Asset Canvas exposes the common layer as three generation node types: **Speech**, **Sound effect**, and **Music**. The Add menu shows a type only when the live audio catalog contains a configured, enabled model for that operation, and each existing node filters the same catalog by its required operation. A speech-only model therefore cannot be selected for music or effects. A Text or Document node can be connected as a prompt source; its current content is combined with the node's local text when the job starts.

Speech nodes store provider-neutral model, speaker, and speed settings. Sound-effect and music nodes store provider-neutral prompt, duration, and loop settings, plus capability-gated options such as negative prompts, lyrics, and instrumental mode. Generated MP3 or WAV output is registered in the Library, written back to the node as an `assetId`, and playable in both generation nodes and Library asset nodes. Model and option selections are remembered independently for each node type.

Existing nodes remain readable when a provider is disconnected, but generation stays disabled until a compatible model is available. Installing a future adapter that advertises sound-effect or music activates the existing node contract and adds that node type to the menu without another canvas schema change. Agent generation tools follow the same live capability filter, so unsupported operations are not offered on a turn.

## Volcengine Doubao Speech

The first adapter uses the official TTS v3 unidirectional HTTP streaming endpoint. Configure it in **Settings → Providers & Models → Doubao Speech**. The key is stored in the local data directory with restricted file permissions and is sent only from the daemon.

Configure a default Volcengine Speaker ID from the console's Voice Library, or supply `voiceId` on an individual request. The adapter supports the official Speech synthesis 2.0 service, MP3 output, mono audio, supported sample rates, language hints, delivery context, and speech-rate control. The first adapter deliberately avoids streamed WAV because the provider documents repeated WAV headers as a streaming caveat; the common layer still supports WAV for adapters that return a valid complete file. Account activation, API key access, model entitlement, quota, and the exact voice ID still belong to the user's Volcengine account and must be verified with a real credential. Voice Clone 2.0 (`seed-icl-2.0`) is intentionally separate because its resource ID, entitlements, and model options differ.

The settings page ships the published seed-tts-2.0 preset voice catalog (`VOLCENGINE_TTS_VOICES` in `src/shared/audio.ts`) as a picker. The provider's `ListSpeakers` API is a console API that requires AccessKey signing instead of the console API key, so the catalog is bundled from the official voice list; cloned or custom Speaker IDs can still be entered as raw IDs. The default voice saves on its own without re-entering the API key, and a preview action synthesizes a short sample (up to 500 characters) to verify the connection and voice before real use.

The daemon endpoints are:

- `GET /audio-models/catalog` — available models plus provider status;
- `GET /settings/models/providers/volcengine-tts` — saved settings without the key;
- `PUT /settings/models/providers/volcengine-tts` — save `{ "apiKey": "..." }`, `{ "defaultVoiceId": "..." }`, or both (voice-only updates keep the stored key; `defaultVoiceId: null` clears it);
- `POST /settings/models/providers/volcengine-tts/preview` — synthesize a short sample and return MP3 bytes;
- `DELETE /settings/models/providers/volcengine-tts` — remove the saved connection;
- `POST /tools/generate-speech/jobs` — enqueue speech generation.

Example job body:

```json
{
  "text": "欢迎来到雾港。",
  "voiceId": "your-volcengine-voice-id",
  "style": "calm fantasy narrator",
  "speed": 0,
  "output": { "format": "mp3", "sampleRate": 24000 }
}
```

The model can be omitted to use the first configured compatible model, or supplied explicitly as `{ "provider": "volcengine-tts", "id": "seed-tts-2.0" }`.

## Standalone Suno / MuMu connection

Configure **Settings → Providers & Models → Suno · MuMu** with a MuMu API key.
The address `https://zhongzhuan.mumuverse.space` and New API Suno protocol are
preconfigured, following the Doubao key-only connection pattern. This is a
third-party connection, independent of Suno's official platform and of the
generic custom-provider configuration. Saving stores the key locally with
mode `0600`; read endpoints return only `configured`. Saving does not verify
the account's model/group permissions or credit balance.

The music node becomes available after connection. It supports the documented
V3/V3.5/V4/V4.5/V5 presets, instrumental music, prompted songs, and exact lyrics.
For exact lyrics, the node's music description supplies the style (`tags`) and
the lyrics field supplies `prompt`; without lyrics the description supplies
`gpt_description_prompt`. The adapter submits `/suno/submit/music`, polls
`/suno/fetch/{task_id}` until the task succeeds, then downloads complete MP3s.
It does not download streaming previews. Every returned variation is stored
as a separate Library asset and tool artifact; the canvas node uses the first.

Duration is automatic. Fixed duration, looping, reference audio, conversion,
continuation and stems are not advertised by this adapter. Cancelling stops
local polling/download; it cannot cancel or refund a task already submitted
to MuMu. Requests time out after 15 minutes. Submission is never automatically
retried: after a timeout or lost response, inspect the MuMu task history before
creating another paid task. Keys are sent only to the configured MuMu origin,
never to the audio CDN.

The settings endpoints are `GET`, `PUT { "apiKey": "..." }` and `DELETE`
`/settings/models/providers/suno-mumu`. Existing provider enable controls and
`POST /tools/generate-music/jobs` remain the common API.

Implementation is isolated in `src/shared/suno.ts`, `src/daemon/suno-provider.ts`
and `src/daemon/suno-settings.ts`, with small registration and settings-view
hooks. The generic custom-provider schema is unchanged. To retire it after an
upstream replacement, disconnect it first, then revert the dedicated Suno
commit (or remove those modules and their registration hooks). Existing MP3
Library assets remain usable independently of this adapter; existing music
nodes can choose a replacement model.

Protocol references: [MuMu models/task format](https://4u264cfiu1.apifox.cn/doc-9454819),
[generation parameters](https://4u264cfiu1.apifox.cn/doc-9454820),
[New API Suno response structure](https://doc.newapi.pro/en/api/suno-music/).

Validated on 2026-10-17: plugin preparation, changelog check, typecheck,
renderer/sandbox builds and Node 26.8.1 startup/MCP/shutdown passed. The full
suite passed 2886 tests across 275 files, with 23 tests and one file skipped.
The isolated browser fixture verified key-only save, model listing, instrumental
and lyric controls, automatic duration, generated-node playback controls, both
tracks in the Library, disabling and the deletion confirmation. The fixture
returned local one-second MP3s and made no paid provider requests. Automated
checks also verify key deletion, secret redaction, no automatic resubmission,
timeout/cancellation and cleanup after a later variant fails to save. Real MuMu
credentials, model permissions, credit and generation quality remain unverified.

## Adding another provider

1. Describe every offered model with precise operations, formats, duration/text limits, execution mode, and optional features.
2. Implement an adapter that translates only supported fields and maps authentication, quota, validation, provider, and network failures to `AudioGenerationError`.
3. Keep task polling or streaming details inside the adapter. Return final bytes plus normalized metadata.
4. Add a secret settings store and provider UI. Never expose the secret from a read endpoint.
5. Add request-translation, failure-mapping, catalog, job, and Library tests.

Do not make one adapter pretend to support all audio operations. Capability-driven selection is what lets TTS, effects, music, dialogue, voice cloning, and future realtime speech coexist behind one contract.
