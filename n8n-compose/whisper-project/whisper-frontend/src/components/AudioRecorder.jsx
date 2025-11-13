/**
 * AudioRecorder Component
 * Uses Web Audio API for browser-based microphone recording
 */
import { useState, useRef, useEffect } from 'react';
import wsClient from '../services/websocket';
import './AudioRecorder.css';

const AudioRecorder = ({ onTranscription, onStatus }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [status, setStatus] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const streamRef = useRef(null);

  // Setup WebSocket listeners
  useEffect(() => {
    const handleTranscription = (data) => {
      console.log('Received transcription:', data);
      if (onTranscription) {
        onTranscription(data);
      }
      setStatus('Transcribed');
    };

    const handleStatus = (data) => {
      console.log('Status:', data.message);
      setStatus(data.message);
      if (onStatus) {
        onStatus(data.message);
      }
    };

    const handleError = (data) => {
      console.error('WebSocket error:', data);
      setStatus(`Error: ${data.message}`);
      stopRecording();
    };

    wsClient.on('transcription', handleTranscription);
    wsClient.on('status', handleStatus);
    wsClient.on('error', handleError);

    return () => {
      wsClient.off('transcription', handleTranscription);
      wsClient.off('status', handleStatus);
      wsClient.off('error', handleError);
    };
  }, [onTranscription, onStatus]);

  // Start recording
  const startRecording = async () => {
    try {
      setIsConnecting(true);
      setStatus('Connecting...');

      // Connect to WebSocket
      await wsClient.connect();
      setStatus('Connected');

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
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
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop all audio tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      // Clear timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      // Signal end of recording to server
      wsClient.endRecording();

      setIsRecording(false);
      setStatus('Processing final audio...');

      // Disconnect WebSocket after a delay to allow final processing
      setTimeout(() => {
        wsClient.disconnect();
      }, 5000);

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
        {status && <span className="status-message">{status}</span>}
      </div>

      <div className="recorder-controls">
        {!isRecording && !isConnecting && (
          <button
            className="btn btn-primary btn-start"
            onClick={startRecording}
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
  );
};

export default AudioRecorder;
