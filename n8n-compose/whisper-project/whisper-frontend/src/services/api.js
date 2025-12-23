/**
 * API client for WhisperX backend
 */
import axios from 'axios';

// Get backend hostname from query parameter or fall back to current hostname
// Usage: https://whisper.tail60cd1d.ts.net/?backend=jacques-m4-macbook-pro-max.tail60cd1d.ts.net
const getBackendHostname = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const backendParam = urlParams.get('backend');
  if (backendParam) {
    // If backend param doesn't include domain, append the tailnet domain
    if (!backendParam.includes('.')) {
      return `${backendParam}.tail60cd1d.ts.net`;
    }
    return backendParam;
  }
  // Fall back to current hostname (for direct backend access)
  return window.location.hostname;
};

// Dynamically construct API URL based on backend hostname
// Tailscale Serve provides HTTPS on port 443, proxying to backend on port 8000
const getApiBaseUrl = () => {
  const hostname = getBackendHostname();
  // Use HTTPS - Tailscale Serve handles TLS termination
  return `https://${hostname}/api`;
};

const API_BASE_URL = getApiBaseUrl();

// Export for use by websocket.js
export { getBackendHostname };

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Transcription API
 */
export const transcriptionAPI = {
  /**
   * Get list of transcriptions
   */
  list: async (page = 1, pageSize = 20, reviewedOnly = null) => {
    const params = { page, page_size: pageSize };
    if (reviewedOnly !== null) {
      params.reviewed_only = reviewedOnly;
    }
    const response = await api.get('/transcriptions', { params });
    return response.data;
  },

  /**
   * Get transcription summaries (for dropdown)
   */
  getSummaries: async () => {
    const response = await api.get('/transcriptions/summaries');
    return response.data;
  },

  /**
   * Get a specific transcription by ID
   */
  get: async (id) => {
    const response = await api.get(`/transcriptions/${id}`);
    return response.data;
  },

  /**
   * Get transcription modification history
   */
  getHistory: async (id) => {
    const response = await api.get(`/transcriptions/${id}/history`);
    return response.data;
  },

  /**
   * Create a new transcription
   */
  create: async (data) => {
    const response = await api.post('/transcriptions', data);
    return response.data;
  },

  /**
   * Update a transcription
   */
  update: async (id, data) => {
    const response = await api.patch(`/transcriptions/${id}`, data);
    return response.data;
  },

  /**
   * Delete a transcription
   */
  delete: async (id) => {
    await api.delete(`/transcriptions/${id}`);
  },

  /**
   * Transcribe an audio file
   */
  transcribeFile: async (file, onProgress = null) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/transcriptions/transcribe', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });

    return response.data;
  },

  /**
   * Use AI to review/rewrite text (synchronous - for short texts)
   * @param {string} text - Text to review
   * @param {string} action - Action to perform
   * @param {string} model - Optional Ollama model to use
   * @param {number} contextWords - Optional max context words for chunking
   */
  aiReview: async (text, action, model = null, contextWords = null) => {
    // Calculate dynamic timeout based on text length
    // Backend chunks text at contextWords (default 4000), processing each chunk sequentially
    // Estimate: ~0.4 seconds per word + 30 second base per chunk + 60 second overall base
    const wordCount = text.trim().split(/\s+/).length;
    const chunkSize = contextWords || 4000;
    const numChunks = Math.ceil(wordCount / chunkSize);

    // Base timeout: 60 seconds + (number of chunks * 30 seconds overhead) + (words * 0.4 seconds)
    const timeoutMs = (60 + (numChunks * 30) + (wordCount * 0.4)) * 1000.0;

    console.log(`[API] AI Review: ${wordCount} words, ${numChunks} chunks, model: ${model || 'default'}, contextWords: ${contextWords || 'default'}, timeout: ${(timeoutMs/1000/60).toFixed(1)} minutes`);

    // Send data in request body to avoid 414 error for long texts
    const requestBody = { text, action };
    if (model) {
      requestBody.model = model;
    }
    if (contextWords) {
      requestBody.context_words = contextWords;
    }

    const response = await api.post('/transcriptions/ai-review', requestBody, {
      timeout: timeoutMs,
    });
    return response.data;
  },

  /**
   * Start an async AI review job (for longer texts)
   * @param {string} text - Text to review
   * @param {string} action - Action to perform
   * @param {string} model - Optional Ollama model to use
   * @param {number} contextWords - Optional max context words for chunking
   * @returns {Promise<{job_id: string, status: string}>}
   */
  aiReviewAsync: async (text, action, model = null, contextWords = null) => {
    // Send data in request body to avoid 414 error for long texts
    const requestBody = { text, action };
    if (model) {
      requestBody.model = model;
    }
    if (contextWords) {
      requestBody.context_words = contextWords;
    }

    const response = await api.post('/transcriptions/ai-review-async', requestBody, {
      timeout: 30000, // Just needs to start the job, 30 seconds is plenty
    });
    return response.data;
  },

  /**
   * Poll for async AI review job status
   * @param {string} jobId - Job ID from aiReviewAsync
   * @returns {Promise<{status: string, result?: string, error?: string}>}
   */
  getAiReviewStatus: async (jobId) => {
    const response = await api.get(`/transcriptions/ai-review-status/${jobId}`, {
      timeout: 10000,
    });
    return response.data;
  },

  /**
   * Stream AI review using Server-Sent Events (SSE)
   * Processes text in chunks and streams results as they complete.
   *
   * @param {string} text - Text to review
   * @param {string} action - Action to perform
   * @param {string} model - Optional Ollama model to use
   * @param {number} contextWords - Optional max context words for chunking
   * @param {object} callbacks - Event callbacks
   * @param {function} callbacks.onStart - Called when processing starts with {total_chunks, action, model}
   * @param {function} callbacks.onProgress - Called for each chunk with {chunk_index, total_chunks, chunk_result}
   * @param {function} callbacks.onProcessing - Called when starting a chunk with {chunk_index, total_chunks, chunk_words}
   * @param {function} callbacks.onComplete - Called when all chunks done with {total_chunks, action}
   * @param {function} callbacks.onError - Called on error with {message}
   * @returns {Promise<string>} - Complete processed text (all chunks joined)
   */
  aiReviewStream: (text, action, model = null, contextWords = null, callbacks = {}) => {
    return new Promise((resolve, reject) => {
      const wordCount = text.trim().split(/\s+/).length;
      console.log(`[API] SSE AI review: ${wordCount} words, action: ${action}, model: ${model || 'default'}, contextWords: ${contextWords || 'default'}`);

      // Build request body
      const requestBody = { text, action };
      if (model) requestBody.model = model;
      if (contextWords) requestBody.context_words = contextWords;

      // Collect chunk results
      const chunkResults = [];

      // Use fetch with SSE parsing (EventSource doesn't support POST)
      fetch(`${API_BASE_URL}/transcriptions/ai-review-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          const processStream = async () => {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                console.log('[API] SSE stream ended');
                break;
              }

              buffer += decoder.decode(value, { stream: true });

              // Parse SSE events from buffer
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              let eventType = null;
              let eventData = null;

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  eventType = line.substring(7).trim();
                } else if (line.startsWith('data: ')) {
                  eventData = line.substring(6);

                  if (eventType && eventData) {
                    try {
                      const data = JSON.parse(eventData);
                      console.log(`[API] SSE event: ${eventType}`, data);

                      switch (eventType) {
                        case 'start':
                          if (callbacks.onStart) callbacks.onStart(data);
                          break;
                        case 'processing':
                          if (callbacks.onProcessing) callbacks.onProcessing(data);
                          break;
                        case 'progress':
                          chunkResults[data.chunk_index] = data.chunk_result;
                          if (callbacks.onProgress) callbacks.onProgress(data);
                          break;
                        case 'complete':
                          if (callbacks.onComplete) callbacks.onComplete(data);
                          // Join all chunks and resolve
                          const result = chunkResults.join(' ');
                          resolve(result);
                          return;
                        case 'error':
                          if (callbacks.onError) callbacks.onError(data);
                          reject(new Error(data.message));
                          return;
                      }
                    } catch (e) {
                      console.error('[API] SSE parse error:', e, 'data:', eventData);
                    }
                    eventType = null;
                    eventData = null;
                  }
                }
              }
            }

            // If we get here without complete event, check if we have results
            if (chunkResults.length > 0) {
              resolve(chunkResults.join(' '));
            } else {
              reject(new Error('Stream ended without results'));
            }
          };

          processStream().catch(reject);
        })
        .catch(reject);
    });
  },

  /**
   * Smart AI review - uses SSE streaming for all texts
   * @param {string} text - Text to review
   * @param {string} action - Action to perform
   * @param {string} model - Optional Ollama model to use
   * @param {function} onProgress - Optional callback for progress updates (receives status string)
   * @param {number} contextWords - Optional max context words for chunking
   * @returns {Promise<{result: string}>}
   */
  aiReviewSmart: async (text, action, model = null, onProgress = null, contextWords = null) => {
    const wordCount = text.trim().split(/\s+/).length;
    console.log(`[API] Smart AI review: ${wordCount} words, action: ${action}`);

    // Use SSE streaming for all requests (handles chunking on backend)
    const result = await transcriptionAPI.aiReviewStream(
      text,
      action,
      model,
      contextWords,
      {
        onStart: (data) => {
          console.log(`[API] Started: ${data.total_chunks} chunks, model: ${data.model}`);
          if (onProgress) {
            onProgress(`Starting... (${data.total_chunks} chunks)`);
          }
        },
        onProcessing: (data) => {
          if (onProgress) {
            onProgress(`Processing chunk ${data.chunk_index + 1}/${data.total_chunks} (${data.chunk_words} words)...`);
          }
        },
        onProgress: (data) => {
          if (onProgress) {
            onProgress(`Completed chunk ${data.chunk_index + 1}/${data.total_chunks}`);
          }
        },
        onComplete: (data) => {
          console.log(`[API] Complete: ${data.total_chunks} chunks`);
          if (onProgress) {
            onProgress('Processing complete!');
          }
        },
        onError: (data) => {
          console.error(`[API] Error: ${data.message}`);
        },
      }
    );

    return { result };
  },

  /**
   * Get audio file duration and estimated transcription time
   * @param {string} audioPath - API path to audio file
   * @returns {Promise<{duration: number, estimated_transcription_seconds: number}>}
   */
  getAudioDuration: async (audioPath) => {
    const response = await api.get('/transcriptions/audio-duration', {
      params: { audio_path: audioPath },
      timeout: 0, // No timeout - ffprobe can be slow on large files
    });
    return response.data;
  },

  /**
   * Re-transcribe an audio file by its server path
   * @param {string} audioPath - API path to audio file (e.g., /api/audio/filename.webm)
   * @param {string} language - Optional language code
   * @param {boolean} diarize - Enable speaker diarization
   * @returns {Promise<{segments: Array, text: string, markdown: string, duration: number}>}
   */
  retranscribe: async (audioPath, language = null, diarize = false) => {
    const requestBody = { audio_path: audioPath, diarize };
    if (language && language !== 'auto') {
      requestBody.language = language;
    }

    // No timeout - transcription can take a very long time for large files
    const response = await api.post('/transcriptions/transcribe-path', requestBody, {
      timeout: 0, // No timeout
    });
    return response.data;
  },

  /**
   * Get list of available Ollama models
   */
  getOllamaModels: async () => {
    const response = await api.get('/transcriptions/ollama-models');
    return response.data;
  },

  /**
   * Get information about a specific Ollama model (including context window size)
   * @param {string} modelName - Model name to query
   * @returns {Promise<{name: string, context_length: number}>}
   */
  getOllamaModelInfo: async (modelName) => {
    const response = await api.get(`/transcriptions/ollama-model-info/${encodeURIComponent(modelName)}`);
    return response.data;
  },
};

/**
 * Health check
 */
export const healthCheck = async () => {
  const response = await api.get('/health', { baseURL: '/' });
  return response.data;
};

/**
 * Convenience functions for components
 */
export const fetchTranscriptionSummaries = () => transcriptionAPI.getSummaries();
export const fetchTranscriptionById = (id) => transcriptionAPI.get(id);
export const saveTranscription = (data) => transcriptionAPI.create(data);
export const updateTranscription = (id, data) => transcriptionAPI.update(id, data);
export const deleteTranscription = (id) => transcriptionAPI.delete(id);

export default api;
