/**
 * API client for WhisperX backend
 */
import axios from 'axios';

const API_BASE_URL = '/api';

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
   * Use AI to review/rewrite text
   */
  aiReview: async (text, action) => {
    const response = await api.post('/transcriptions/ai-review', null, {
      params: { text, action },
    });
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
