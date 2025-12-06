/**
 * AudioRecorder Component
 * Uses Web Audio API for browser-based microphone recording
 */
import { useState, useRef, useEffect } from 'react';
import wsClient from '../services/websocket';
import { getBackendHostname } from '../services/api';
import AudioVisualizer from './AudioVisualizer';
import AudioPlayer from './AudioPlayer';
import './AudioRecorder.css';

const AudioRecorder = ({ onTranscription, onStatus, onRecordingStateChange, loadedAudioPath, audioDuration, resumeTranscriptionId, language, disabled }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);  // True while ffmpeg processes audio
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    // Load saved model from localStorage, or default to whisper-tiny
    const savedModel = localStorage.getItem('whisper-selected-model');
    return savedModel || 'mlx-community/whisper-tiny';
  });
  const [selectedChannel, setSelectedChannel] = useState(() => {
    // Load saved channel from localStorage, or default to 'both'
    const savedChannel = localStorage.getItem('whisper-selected-channel');
    return savedChannel || 'both';
  });
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingCompleted, setRecordingCompleted] = useState(false);
  const [recordedDuration, setRecordedDuration] = useState(null);  // Duration from backend after recording

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const disconnectTimeoutRef = useRef(null);
  const currentTranscriptionIdRef = useRef(null);  // Track current transcription ID

  // Notify parent when recording state changes or audio URL is available
  useEffect(() => {
    if (onRecordingStateChange) {
      // Pass true if we have audio to resume from (either from DB or unsaved)
      // This prevents clearing transcription data when resuming
      const hasAudioToResume = loadedAudioPath ? true : false;
      // Include duration from backend (total duration including any concatenated audio)
      // Only pass audioUrl if it's from current session (not when loadedAudioPath changed from selecting a transcription)
      onRecordingStateChange(isRecording, audioUrl, hasAudioToResume, recordedDuration);
    }
  }, [isRecording, audioUrl, onRecordingStateChange, recordedDuration]);
  // Note: removed loadedAudioPath and resumeTranscriptionId from dependencies
  // Those changes are handled by handleTranscriptionSelect in App.jsx directly

  // Detect when transcription changes (switching to different transcription or starting new)
  useEffect(() => {
    const prevId = currentTranscriptionIdRef.current;
    const currentId = resumeTranscriptionId;

    // Determine if this is a real context change that requires reconnection
    let shouldReconnect = false;
    let shouldClearAudioUrl = false;

    if (prevId === null && currentId === undefined) {
      // null -> undefined: no change
      shouldReconnect = false;
    } else if (prevId === undefined && currentId) {
      // undefined -> ID: first time assigning after save, don't reconnect
      shouldReconnect = false;
    } else if (prevId === null && currentId) {
      // null -> ID: first time assigning after save, don't reconnect
      shouldReconnect = false;
    } else if (prevId && currentId === null) {
      // ID -> null: clearing selection, reconnect
      shouldReconnect = true;
      shouldClearAudioUrl = true;
    } else if (prevId && currentId === undefined) {
      // ID -> undefined: clearing selection, reconnect
      shouldReconnect = true;
      shouldClearAudioUrl = true;
    } else if (prevId !== currentId && prevId && currentId) {
      // Different IDs: switching transcriptions, reconnect
      shouldReconnect = true;
      shouldClearAudioUrl = true;
    }

    // Clear the current session's audioUrl when switching transcriptions
    // This prevents the old audioUrl from overwriting the newly selected transcription's audio
    if (shouldClearAudioUrl) {
      console.log(`[AudioRecorder] Clearing audioUrl due to transcription switch`);
      setAudioUrl(null);
      setRecordedDuration(null);
      setRecordingCompleted(false);
    }

    if (shouldReconnect) {
      console.log(`[AudioRecorder] Transcription context changed from ${prevId} to ${currentId} - reconnecting WebSocket`);

      // Disconnect and reconnect to reset backend state
      wsClient.disconnect();
      setTimeout(async () => {
        try {
          await wsClient.connect(selectedModel);
          wsClient.setChannel(selectedChannel);
        } catch (error) {
          console.error('Error reconnecting WebSocket:', error);
        }
      }, 100);
    } else if (prevId !== currentId) {
      console.log(`[AudioRecorder] Transcription ID changed from ${prevId} to ${currentId} but keeping WebSocket connected (same context)`);
    }

    currentTranscriptionIdRef.current = currentId;
  }, [resumeTranscriptionId, selectedModel, selectedChannel]);

  // Clear audio player when loadedAudioPath becomes null (e.g., selecting "New Transcription")
  useEffect(() => {
    if (loadedAudioPath === null) {
      console.log('[AudioRecorder] loadedAudioPath is null - clearing audio player');
      setAudioUrl(null);
      setRecordedDuration(null);
      setRecordingCompleted(false);
    }
  }, [loadedAudioPath]);

  // Load default model on startup (runs in parallel with transcription loading)
  useEffect(() => {
    let isMounted = true;

    const loadDefaultModel = async () => {
      setIsLoadingModel(true);

      try {
        // Status updates will come from WebSocket status handler
        await wsClient.connect(selectedModel);

        // Only update state if component is still mounted
        if (isMounted) {
          // Send channel selection after model is loaded
          wsClient.setChannel(selectedChannel);

          // Model is ready - clear loading state
          setIsLoadingModel(false);
        }
      } catch (error) {
        console.error('Error loading default model:', error);
        if (isMounted) {
          setStatus(`Connection error: ${error.message}. Try refreshing the page.`);
          setIsLoadingModel(false);
        }
      }
    };

    loadDefaultModel();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      wsClient.disconnect();
    };
  }, []); // Run once on mount

  // Setup WebSocket listeners
  useEffect(() => {
    const handleTranscription = (data) => {
      console.log('Received transcription:', data);
      if (onTranscription) {
        onTranscription(data);
      }

      // Update status based on transcription type
      if (data.streaming) {
        setStatus('Streaming transcription...');
      } else if (data.final) {
        setStatus('Final transcription received');
      } else {
        setStatus('Transcribed');
      }

      // Don't disconnect after final transcription - keep WebSocket alive
      // to preserve resume_transcription_id state for concatenation
    };

    const handleStatus = (data) => {
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }

      // Capture audio URL and duration when recording is complete
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
        setRecordingCompleted(true);
        setIsProcessingAudio(false);  // Audio processing is complete
        console.log('Audio file available:', data.audio_url);
      }
      // Capture duration from backend (total duration including concatenated audio)
      if (data.duration_seconds !== undefined) {
        setRecordedDuration(data.duration_seconds);
        console.log('Recording duration from backend:', data.duration_seconds, 'seconds');
      }
    };

    const handleDownloadProgress = (data) => {
      // Update status with download progress
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }
    };

    const handleProcessingAudio = (data) => {
      // Backend is processing audio (adding cue points for seeking)
      // Disable recording button during this time
      console.log('[AudioRecorder] Processing audio started:', data.message);
      setIsProcessingAudio(true);
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }
    };

    const handleError = (data) => {
      console.error('WebSocket error:', data);
      setStatus(`Error: ${data.message}`);
      setIsProcessingAudio(false);  // Clear processing state on error
      // Don't auto-stop on errors - let user decide whether to stop
      // stopRecording();
    };

    wsClient.on('transcription', handleTranscription);
    wsClient.on('status', handleStatus);
    wsClient.on('download_progress', handleDownloadProgress);
    wsClient.on('processing_audio', handleProcessingAudio);
    wsClient.on('error', handleError);

    return () => {
      wsClient.off('transcription', handleTranscription);
      wsClient.off('status', handleStatus);
      wsClient.off('download_progress', handleDownloadProgress);
      wsClient.off('processing_audio', handleProcessingAudio);
      wsClient.off('error', handleError);
    };
  }, [onTranscription, onStatus]);

  // Handle model selection change
  const handleModelChange = async (newModel) => {
    setSelectedModel(newModel);
    setIsLoadingModel(true);

    // Save selected model to localStorage
    localStorage.setItem('whisper-selected-model', newModel);

    try {
      // Disconnect existing WebSocket if any
      wsClient.disconnect();

      // Connect to WebSocket with new model
      // Status updates will come from WebSocket status handler
      await wsClient.connect(newModel);

      // Send channel selection after model is loaded
      wsClient.setChannel(selectedChannel);

      // Model is ready - clear loading state
      setIsLoadingModel(false);
    } catch (error) {
      console.error('Error loading model:', error);
      setStatus(`Error: ${error.message}`);
      setIsLoadingModel(false);
    }
  };

  // Handle channel selection change
  const handleChannelChange = (newChannel) => {
    setSelectedChannel(newChannel);

    // Save selected channel to localStorage
    localStorage.setItem('whisper-selected-channel', newChannel);

    // Send channel selection to WebSocket if connected
    wsClient.setChannel(newChannel);

    console.log(`Channel changed to: ${newChannel}`);
  };

  // Start recording
  const startRecording = async () => {
    try {
      setIsConnecting(true);
      setStatus('Starting recording...');

      // If starting a fresh recording (no audio to resume), reconnect to clear backend state
      // Check both loadedAudioPath (from DB) and audioUrl (from current session)
      if (!loadedAudioPath && !audioUrl) {
        console.log('[AudioRecorder] Starting fresh recording - reconnecting WebSocket to clear backend state');
        wsClient.disconnect();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // If not already connected, connect now
      if (!wsClient.isConnected || !wsClient.modelReady) {
        setStatus('Connecting...');
        await wsClient.connect(selectedModel);
      }

      // Wait for WebSocket to be fully ready
      let retries = 0;
      while ((!wsClient.isConnected || !wsClient.modelReady) && retries < 20) {
        console.log('[AudioRecorder] Waiting for WebSocket to be ready...', { isConnected: wsClient.isConnected, modelReady: wsClient.modelReady });
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (!wsClient.isConnected || !wsClient.modelReady) {
        throw new Error('WebSocket connection timeout');
      }

      console.log('[AudioRecorder] WebSocket is ready');

      // Always send channel selection when starting recording
      // This ensures the channel is set even if WebSocket reconnected
      wsClient.setChannel(selectedChannel);

      // Send language setting (null for auto-detect)
      const languageCode = language === 'auto' ? null : language;
      wsClient.setLanguage(languageCode);
      console.log('[AudioRecorder] Setting language:', languageCode || 'auto-detect');

      // Longer delay to ensure WebSocket is ready to receive resume messages
      await new Promise(resolve => setTimeout(resolve, 200));

      // If resuming, send the appropriate resume message
      // Use loadedAudioPath (from DB) or audioUrl (from current unsaved session)
      const audioPathToResume = loadedAudioPath || audioUrl;
      console.log('[AudioRecorder] Starting recording - resumeTranscriptionId:', resumeTranscriptionId);
      console.log('[AudioRecorder] loadedAudioPath:', loadedAudioPath);
      console.log('[AudioRecorder] audioUrl (internal state):', audioUrl);
      console.log('[AudioRecorder] audioPathToResume:', audioPathToResume);
      console.log('[AudioRecorder] wsClient.isConnected:', wsClient.isConnected, 'modelReady:', wsClient.modelReady);
      if (resumeTranscriptionId && audioPathToResume) {
        // Have both ID and audio - resume from database record
        console.log('[AudioRecorder] Sending setResumeTranscription:', resumeTranscriptionId, 'with audio:', audioPathToResume);
        wsClient.setResumeTranscription(resumeTranscriptionId);
      } else if (audioPathToResume) {
        // Have audio but no ID - resume from audio file directly (unsaved transcription)
        console.log('[AudioRecorder] Sending setResumeAudio:', audioPathToResume);
        wsClient.setResumeAudio(audioPathToResume);
      } else {
        console.log('[AudioRecorder] NOT resuming - no audio to append to');
      }

      setStatus('Connected');

      // Request microphone access with stereo support
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,     // Disable echo cancellation for cleaner audio
          noiseSuppression: false,     // Disable noise suppression to prevent distortion
          autoGainControl: false,      // Disable automatic gain control (AGC) - uses system volume
          sampleRate: 16000,
          channelCount: 2,             // Request stereo audio
        }
      });

      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          // Send chunk to server
          event.data.arrayBuffer().then((buffer) => {
            const duration = mediaRecorder.state === 'recording' ? 3.0 : 0;
            wsClient.sendAudioChunk(buffer, duration);
          });
        }
      };

      // Start recording (capture in 3-second chunks)
      mediaRecorder.start(3000);

      setIsRecording(true);
      setIsConnecting(false);
      setRecordingTime(0);
      setStatus('Recording...');
      // Only clear audioUrl if starting fresh (not resuming from existing audio)
      // When resuming, we need to keep audioUrl so the backend knows what to concatenate with
      if (!audioPathToResume) {
        setAudioUrl(null); // Clear previous audio only for fresh recordings
      }
      setRecordingCompleted(false); // Reset completion status
      setRecordedDuration(null); // Reset duration - will be set by backend after recording

      // Start timer
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error starting recording:', error);
      setStatus(`Error: ${error.message}`);
      setIsConnecting(false);
      setIsRecording(false);
    }
  };

  // Stop recording
  const stopRecording = () => {
    try {
      setIsRecording(false);
      setIsProcessingAudio(true);  // Show "Optimizing audio..." immediately
      setStatus('Processing audio...');

      // Clear timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      // Setup handler for final data chunk
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        const mediaRecorder = mediaRecorderRef.current;

        // Wait for final ondataavailable event before signaling end
        mediaRecorder.onstop = () => {
          console.log('MediaRecorder stopped, sending end recording signal');

          // Stop all audio tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }

          // Now signal end of recording after all chunks are sent
          // Add small delay to ensure final chunk is sent
          setTimeout(() => {
            wsClient.endRecording();
          }, 100);
        };

        // Stop MediaRecorder - this will trigger onstop after final ondataavailable
        mediaRecorder.stop();
      } else {
        // No MediaRecorder, just end recording
        wsClient.endRecording();
      }

    } catch (error) {
      console.error('Error stopping recording:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-recorder">
      <div className="recorder-header">
        <h2>Audio Recording</h2>

        {/* Recording controls right after title */}
        <div className="recorder-controls">
          {!isRecording && !isConnecting && !isProcessingAudio && (
            <button
              className="btn btn-primary btn-start"
              onClick={startRecording}
              disabled={isLoadingModel || disabled}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              Start Recording
            </button>
          )}

          {isConnecting && (
            <button className="btn btn-secondary" disabled>
              Connecting...
            </button>
          )}

          {isProcessingAudio && !isRecording && !isConnecting && (
            <button className="btn btn-secondary" disabled>
              <span className="spinner"></span>
              Optimizing audio...
            </button>
          )}

          {isRecording && (
            <div className="recording-active">
              <div className="recording-indicator">
                <span className="recording-dot"></span>
                <span className="recording-time">{formatTime(recordingTime)}</span>
              </div>
              <button
                className="btn btn-danger btn-stop"
                onClick={stopRecording}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
                Stop Recording
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Model selector and status */}
      <div className="recorder-settings">
        <div className="model-selector">
          <label htmlFor="model-select">Model:</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={isRecording || isConnecting || isLoadingModel}
            className="model-select"
          >
            <option value="mlx-community/whisper-tiny">Tiny (Fastest, 75MB)</option>
            <option value="mlx-community/whisper-base-mlx">Base (Fast, 145MB)</option>
            <option value="mlx-community/whisper-small-mlx">Small (Better, 483MB)</option>
            <option value="mlx-community/whisper-medium-mlx">Medium (Best, 1.5GB)</option>
            <option value="mlx-community/whisper-large-v3-mlx">Large V3 (Highest Accuracy, 3GB)</option>
            <option value="mlx-community/whisper-large-v3-turbo">Turbo (Fast + Accurate, 809MB)</option>
          </select>
        </div>

        <div className="channel-selector">
          <label htmlFor="channel-select">Audio Channel:</label>
          <select
            id="channel-select"
            value={selectedChannel}
            onChange={(e) => handleChannelChange(e.target.value)}
            disabled={isRecording || isConnecting || isLoadingModel}
            className="channel-select"
          >
            <option value="both">Both Channels (Mixed)</option>
            <option value="left">Left Channel Only</option>
            <option value="right">Right Channel Only</option>
          </select>
        </div>

        {isLoadingModel && (
          <div className="loading-indicator">
            <span className="spinner"></span>
            <span>{status || 'Loading model...'}</span>
          </div>
        )}

        {!isLoadingModel && status && <span className="status-message">{status}</span>}
      </div>

      {/* Audio Visualizer - shown while recording */}
      {isRecording && (
        <AudioVisualizer mediaStream={streamRef.current} isRecording={isRecording} />
      )}

      {/* Audio Player - shown after recording completes or when loaded transcription has audio */}
      {!isRecording && loadedAudioPath && (
        <AudioPlayer
          key={`${loadedAudioPath}-${audioDuration || 'no-duration'}`}
          audioUrl={`https://${getBackendHostname()}${loadedAudioPath}`}
          durationSeconds={audioDuration}
        />
      )}
    </div>
  );
};

export default AudioRecorder;
