/**
 * WebSocket client for real-time transcription
 */
import { getBackendHostname } from './api';

class TranscriptionWebSocket {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.selectedModel = null;
    this.modelReady = false;
    this.listeners = {
      transcription: [],
      status: [],
      error: [],
      connect: [],
      disconnect: [],
      model_ready: [],
      download_progress: [],
      processing_audio: [],
    };
  }

  /**
   * Connect to WebSocket server
   * @param {string} model - The Whisper model to use for transcription
   */
  connect(model = 'mlx-community/whisper-tiny') {
    return new Promise((resolve, reject) => {
      try {
        this.selectedModel = model;
        this.modelReady = false;

        // Determine WebSocket URL - Tailscale Serve provides WSS on port 443
        const hostname = getBackendHostname();
        // Use wss:// for secure WebSocket - Tailscale Serve handles TLS termination
        const wsUrl = `wss://${hostname}/ws/transcribe`;

        console.log('Connecting to WebSocket:', wsUrl, 'with model:', model);

        this.ws = new WebSocket(wsUrl);

        // Set up one-time listener for model ready
        const modelReadyHandler = () => {
          this.modelReady = true;
          this.off('model_ready', modelReadyHandler);
          this.off('error', errorHandler);
          clearTimeout(timeoutId);
          resolve();
        };
        this.on('model_ready', modelReadyHandler);

        // Set up error handler for model loading failures
        const errorHandler = (data) => {
          if (data.message && data.message.includes('model')) {
            this.off('model_ready', modelReadyHandler);
            this.off('error', errorHandler);
            clearTimeout(timeoutId);
            reject(new Error(data.message));
          }
        };
        this.on('error', errorHandler);

        // Set timeout for model loading (10 minutes for large models)
        const timeoutId = setTimeout(() => {
          this.off('model_ready', modelReadyHandler);
          this.off('error', errorHandler);
          reject(new Error('Model loading timeout - please try again'));
        }, 600000); // 10 minutes

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;

          // Send model selection to server
          const message = {
            type: 'set_model',
            model: this.selectedModel,
          };
          this.ws.send(JSON.stringify(message));

          this._emit('connect');
          // Don't resolve here - wait for model_ready event
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this._handleMessage(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          // Clean up handlers and timeout on error
          this.off('model_ready', modelReadyHandler);
          this.off('error', errorHandler);
          clearTimeout(timeoutId);
          this._emit('error', { message: 'WebSocket connection error' });
          reject(new Error('WebSocket connection failed. Is the backend running?'));
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isConnected = false;
          this._emit('disconnect');
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Send audio chunk to server
   */
  sendAudioChunk(audioData, duration) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    // Convert audio data to base64
    const base64Audio = this._arrayBufferToBase64(audioData);

    const message = {
      type: 'audio_chunk',
      data: base64Audio,
      duration: duration,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Signal end of recording
   */
  endRecording() {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'end_recording',
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send ping to keep connection alive
   */
  ping() {
    if (!this.isConnected || !this.ws) {
      return;
    }

    const message = {
      type: 'ping',
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Set channel selection for transcription
   * @param {string} channel - The channel to transcribe ('left', 'right', or 'both')
   */
  setChannel(channel) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'set_channel',
      channel: channel,
    };

    console.log('Sending channel selection:', channel);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Set transcription to resume (for appending audio)
   * @param {number} transcriptionId - The ID of the transcription to resume
   */
  setResumeTranscription(transcriptionId) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'set_resume_transcription',
      transcription_id: transcriptionId,
    };

    console.log('Setting resume transcription ID:', transcriptionId);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Set audio file to resume from (for appending audio without database record)
   * @param {string} audioPath - The API path to the audio file
   */
  setResumeAudio(audioPath) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'set_resume_audio',
      audio_path: audioPath,
    };

    console.log('Setting resume audio path:', audioPath);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Set language for transcription
   * @param {string} language - Language code (e.g., 'en', 'fr', 'auto')
   */
  setLanguage(language) {
    if (!this.isConnected || !this.ws) {
      console.error('WebSocket not connected');
      return;
    }

    const message = {
      type: 'set_language',
      language: language === 'auto' ? null : language,
    };

    console.log('Setting transcription language:', language);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback
      );
    }
  }

  /**
   * Handle incoming message
   */
  _handleMessage(message) {
    const { type, ...data} = message;

    switch (type) {
      case 'transcription':
        this._emit('transcription', data);
        break;
      case 'status':
        this._emit('status', data);
        // Don't check for "ready" in status messages - only use explicit model_ready event
        break;
      case 'model_ready':
        this._emit('model_ready', data);
        break;
      case 'download_progress':
        this._emit('download_progress', data);
        break;
      case 'processing_audio':
        this._emit('processing_audio', data);
        break;
      case 'error':
        this._emit('error', data);
        break;
      case 'pong':
        // Keepalive response
        break;
      default:
        console.warn('Unknown message type:', type);
    }
  }

  /**
   * Emit event to listeners
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Convert ArrayBuffer to base64
   */
  _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  }
}

// Create singleton instance
const wsClient = new TranscriptionWebSocket();

export default wsClient;
