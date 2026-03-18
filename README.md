# sttai

Official Node.js SDK for [STT.ai](https://stt.ai) — Speech-to-Text API.

Transcribe audio files, stream live audio, summarize transcripts, and more.

## Installation

```bash
npm install sttai
```

## Quick Start

```javascript
const { STTClient } = require('sttai');

const client = new STTClient({ apiKey: 'your-api-key' });

// Transcribe a file
const result = await client.transcribe('audio.mp3');
console.log(result.text);
```

## Usage

### Initialize the Client

```javascript
const { STTClient } = require('sttai');

const client = new STTClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.stt.ai', // optional, this is the default
});
```

### Transcribe a File

```javascript
const result = await client.transcribe('meeting.wav', {
  model: 'large-v3',       // optional: model to use
  language: 'en',           // optional: language code
  diarize: true,            // optional: enable speaker diarization
  speakers: 3,              // optional: expected number of speakers
  responseFormat: 'json',   // optional: "json", "text", "srt", "vtt"
});

console.log(result.text);
console.log(result.segments);  // timestamped segments
console.log(result.speakers);  // speaker-labeled segments (if diarize=true)
```

### Summarize Text

```javascript
const summary = await client.summarize(result.text, 'brief');
// Styles: "brief", "detailed", "bullets", "headline"
console.log(summary.text);
```

### List Models

```javascript
const models = await client.models();
console.log(models);
```

### List Supported Languages

```javascript
const languages = await client.languages();
console.log(languages);
```

### Health Check

```javascript
const status = await client.health();
console.log(status);
```

### Streaming Transcription (WebSocket)

```javascript
const stream = client.stream(
  (message) => {
    console.log('Received:', message);
  },
  { model: 'large-v3', language: 'en' }
);

stream.on('open', () => {
  console.log('Connected');
  // Send audio data as Buffer chunks
  stream.send(audioBuffer);
});

stream.on('partial', (msg) => {
  process.stdout.write(msg.text); // partial results as they arrive
});

stream.on('transcript', (msg) => {
  console.log('Final:', msg.text); // finalized transcript segment
});

stream.on('error', (err) => {
  console.error('Stream error:', err.message);
});

stream.on('close', ({ code, reason }) => {
  console.log('Disconnected', code, reason);
});

// When done, close the connection
stream.close();
```

## Error Handling

The SDK throws specific error types for different failure modes:

```javascript
const { STTClient, AuthError, RateLimitError, CreditError, STTError } = require('sttai');

try {
  const result = await client.transcribe('audio.mp3');
} catch (err) {
  if (err instanceof AuthError) {
    console.error('Invalid API key');
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${err.retryAfter} seconds`);
  } else if (err instanceof CreditError) {
    console.error('Out of credits — upgrade at https://stt.ai/pricing');
  } else if (err instanceof STTError) {
    console.error(`API error (${err.statusCode}): ${err.message}`);
  }
}
```

| Error Class | HTTP Status | Description |
|---|---|---|
| `AuthError` | 401, 403 | Invalid or missing API key |
| `CreditError` | 402 | Insufficient credits |
| `RateLimitError` | 429 | Too many requests |
| `STTError` | Any | Base error for all other API errors |

## API Reference

### `new STTClient({ apiKey, baseUrl })`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiKey` | `string` | Yes | — | Your STT.ai API key |
| `baseUrl` | `string` | No | `https://api.stt.ai` | API base URL |

### `client.transcribe(filePath, options)`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `filePath` | `string` | Yes | — | Path to audio file |
| `options.model` | `string` | No | — | Transcription model |
| `options.language` | `string` | No | — | Language code |
| `options.diarize` | `boolean` | No | `false` | Enable speaker diarization |
| `options.speakers` | `number` | No | — | Expected number of speakers |
| `options.responseFormat` | `string` | No | `json` | Response format |

### `client.summarize(text, style)`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `text` | `string` | Yes | — | Text to summarize |
| `style` | `string` | No | `brief` | Style: brief, detailed, bullets, headline |

### `client.models()`

Returns available transcription models.

### `client.languages()`

Returns supported languages.

### `client.health()`

Returns API health status.

### `client.stream(callback, options)`

Returns an EventEmitter with `send(buffer)` and `close()` methods.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `callback` | `function` | No | Called with each message |
| `options.model` | `string` | No | Transcription model |
| `options.language` | `string` | No | Language code |

**Events:** `open`, `partial`, `transcript`, `message`, `error`, `close`

## Requirements

- Node.js 16 or later
- Uses native `fetch` on Node 18+, falls back to `node-fetch` on Node 16/17

## License

MIT
