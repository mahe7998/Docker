/**
 * WebSocket client for real-time transcription
 */

class TranscriptionWebSocket {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.listeners = {
      transcription: [],
      status: [],
      error: [],
      connect: [],
      disconnect: [],
    };
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Determine WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/transcribe`;

        console.log('Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this._emit('connect');
          resolve();
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
          this._emit('error', { message: 'WebSocket connection error' });
          reject(error);
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
    const { type, ...data } = message;

    switch (type) {
      case 'transcription':
        this._emit('transcription', data);
        break;
      case 'status':
        this._emit('status', data);
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
