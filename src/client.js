const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const FormData = require('form-data');
const { STTError, RateLimitError, AuthError, CreditError } = require('./errors');

// Use native fetch if available (Node 18+), otherwise require node-fetch
const fetchFn = typeof globalThis.fetch === 'function'
  ? globalThis.fetch
  : (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class STTClient {
  /**
   * Create an STT.ai client
   * @param {Object} options
   * @param {string} options.apiKey - Your STT.ai API key
   * @param {string} [options.baseUrl=https://api.stt.ai] - API base URL
   */
  constructor({ apiKey, baseUrl = 'https://api.stt.ai' } = {}) {
    if (!apiKey) {
      throw new STTError('apiKey is required');
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Build headers for JSON requests
   * @returns {Object}
   */
  _headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };
  }

  /**
   * Handle API error responses
   * @param {Response} response
   * @throws {STTError|RateLimitError|AuthError|CreditError}
   */
  async _handleError(response) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = { error: response.statusText };
    }

    const message = body.error || body.message || body.detail || `HTTP ${response.status}`;

    switch (response.status) {
      case 401:
      case 403:
        throw new AuthError(message, response.status, body);
      case 402:
        throw new CreditError(message, body);
      case 429: {
        const retryAfter = response.headers.get('retry-after');
        throw new RateLimitError(message, retryAfter ? Number(retryAfter) : null, body);
      }
      default:
        throw new STTError(message, response.status, body);
    }
  }

  /**
   * Make a JSON request to the API
   * @param {string} method
   * @param {string} endpoint
   * @param {Object} [body]
   * @returns {Promise<Object>}
   */
  async _request(method, endpoint, body = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: this._headers(),
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const response = await fetchFn(url, options);

    if (!response.ok) {
      await this._handleError(response);
    }

    return response.json();
  }

  /**
   * Transcribe an audio file
   * @param {string} filePath - Path to the audio file
   * @param {Object} [options]
   * @param {string} [options.model] - Transcription model to use
   * @param {string} [options.language] - Language code (e.g., "en", "es")
   * @param {boolean} [options.diarize] - Enable speaker diarization
   * @param {number} [options.speakers] - Expected number of speakers
   * @param {string} [options.responseFormat] - Response format ("json", "text", "srt", "vtt")
   * @returns {Promise<Object>} Transcription result
   */
  async transcribe(filePath, options = {}) {
    const { model, language, diarize, speakers, responseFormat } = options;

    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new STTError(`File not found: ${resolvedPath}`);
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(resolvedPath));

    if (model) form.append('model', model);
    if (language) form.append('language', language);
    if (diarize !== undefined) form.append('diarize', String(diarize));
    if (speakers !== undefined) form.append('speakers', String(speakers));
    if (responseFormat) form.append('response_format', responseFormat);

    const url = `${this.baseUrl}/v1/transcribe`;
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      await this._handleError(response);
    }

    return response.json();
  }

  /**
   * Summarize text
   * @param {string} text - Text to summarize
   * @param {string} [style="brief"] - Summarization style ("brief", "detailed", "bullets", "headline")
   * @returns {Promise<Object>} Summary result
   */
  async summarize(text, style = 'brief') {
    return this._request('POST', '/v1/summarize', { text, style });
  }

  /**
   * List available transcription models
   * @returns {Promise<Object>} Available models
   */
  async models() {
    return this._request('GET', '/v1/models');
  }

  /**
   * List supported languages
   * @returns {Promise<Object>} Supported languages
   */
  async languages() {
    return this._request('GET', '/v1/languages');
  }

  /**
   * Check API health
   * @returns {Promise<Object>} Health status
   */
  async health() {
    return this._request('GET', '/health');
  }

  /**
   * Open a WebSocket connection for streaming transcription
   * @param {Function} callback - Called with each transcription chunk
   * @param {Object} [options]
   * @param {string} [options.model] - Transcription model
   * @param {string} [options.language] - Language code
   * @returns {EventEmitter} Emits 'transcript', 'partial', 'error', 'close' events
   */
  stream(callback, options = {}) {
    const WebSocket = require('ws');
    const { model, language } = options;

    const params = new URLSearchParams();
    params.set('token', this.apiKey);
    if (model) params.set('model', model);
    if (language) params.set('language', language);

    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/v1/stream?${params.toString()}`;
    const emitter = new EventEmitter();
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      emitter.emit('open');
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'partial') {
          emitter.emit('partial', message);
        } else if (message.type === 'transcript') {
          emitter.emit('transcript', message);
        } else {
          emitter.emit('message', message);
        }
        if (callback) callback(message);
      } catch (err) {
        emitter.emit('error', new STTError(`Failed to parse message: ${err.message}`));
      }
    });

    ws.on('error', (err) => {
      emitter.emit('error', new STTError(`WebSocket error: ${err.message}`));
    });

    ws.on('close', (code, reason) => {
      emitter.emit('close', { code, reason: reason.toString() });
    });

    /**
     * Send audio data through the WebSocket
     * @param {Buffer} audioData
     */
    emitter.send = (audioData) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(audioData);
      } else {
        emitter.emit('error', new STTError('WebSocket is not open'));
      }
    };

    /**
     * Close the WebSocket connection
     */
    emitter.close = () => {
      ws.close();
    };

    return emitter;
  }
}

module.exports = { STTClient };
