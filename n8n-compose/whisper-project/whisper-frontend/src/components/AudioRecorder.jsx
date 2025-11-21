/**
 * AudioRecorder Component
 * Uses Web Audio API for browser-based microphone recording
 */
import { useState, useRef, useEffect } from 'react';
import wsClient from '../services/websocket';
import AudioVisualizer from './AudioVisualizer';
import AudioPlayer from './AudioPlayer';
import './AudioRecorder.css';

const AudioRecorder = ({ onTranscription, onStatus, onRecordingStateChange, loadedAudioPath, audioDuration }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingModel, setIsLoadingModel] = useState(false);
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

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);
  const disconnectTimeoutRef = useRef(null);

  // Notify parent when recording state changes or audio URL is available
  useEffect(() => {
    if (onRecordingStateChange) {
      onRecordingStateChange(isRecording, audioUrl);
    }
  }, [isRecording, audioUrl, onRecordingStateChange]);

  // Load default model on startup (runs in parallel with transcription loading)
  useEffect(() => {
    const loadDefaultModel = async () => {
      setIsLoadingModel(true);

      try {
        // Status updates will come from WebSocket status handler
        await wsClient.connect(selectedModel);

        // Send channel selection after model is loaded
        wsClient.setChannel(selectedChannel);

        // Model is ready - clear loading state
        setIsLoadingModel(false);
      } catch (error) {
        console.error('Error loading default model:', error);
        setStatus(`Error: ${error.message}`);
        setIsLoadingModel(false);
      }
    };

    loadDefaultModel();

    // Cleanup on unmount
    return () => {
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

      // If this is the final transcription, disconnect WebSocket
      if (data.final) {
        console.log('Received final transcription, disconnecting WebSocket');
        setTimeout(() => {
          wsClient.disconnect();
        }, 500); // Short delay to ensure message is processed
      }
    };

    const handleStatus = (data) => {
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }

      // Capture audio URL when recording is complete
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
        setRecordingCompleted(true);
        console.log('Audio file available:', data.audio_url);
      }
    };

    const handleDownloadProgress = (data) => {
      // Update status with download progress
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }
    };

    const handleError = (data) => {
      console.error('WebSocket error:', data);
      setStatus(`Error: ${data.message}`);
      // Don't auto-stop on errors - let user decide whether to stop
      // stopRecording();
    };

    wsClient.on('transcription', handleTranscription);
    wsClient.on('status', handleStatus);
    wsClient.on('download_progress', handleDownloadProgress);
    wsClient.on('error', handleError);

    return () => {
      wsClient.off('transcription', handleTranscription);
      wsClient.off('status', handleStatus);
      wsClient.off('download_progress', handleDownloadProgress);
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

      // If not already connected, connect now
      if (!wsClient.isConnected || !wsClient.modelReady) {
        setStatus('Connecting...');
        await wsClient.connect(selectedModel);
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
      setAudioUrl(null); // Clear previous audio
      setRecordingCompleted(false); // Reset completion status

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
      setStatus('Processing final audio...');

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
          {!isRecording && !isConnecting && (
            <button
              className="btn btn-primary btn-start"
              onClick={startRecording}
              disabled={isLoadingModel}
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
          audioUrl={loadedAudioPath}
          durationSeconds={audioDuration}
        />
      )}
    </div>
  );
};

export default AudioRecorder;
