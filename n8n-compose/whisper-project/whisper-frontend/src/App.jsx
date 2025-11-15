/**
 * Main App Component
 * Combines AudioRecorder and TranscriptionEditor
 */
import { useState, useRef } from 'react';
import AudioRecorder from './components/AudioRecorder';
import TranscriptionEditor from './components/TranscriptionEditor';
import './App.css';

function App() {
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const editorRef = useRef(null);

  // Handle recording state changes
  const handleRecordingStateChange = (recording) => {
    setIsRecording(recording);
    if (recording) {
      // Clear previous transcription when starting new recording
      setTranscriptionData(null);
    }
  };

  // Handle incoming transcription from WebSocket
  const handleTranscription = (data) => {
    console.log('Received transcription data:', data);

    // With the new sliding window approach, we always append new text
    // The backend handles deduplication and only sends new portions
    if (data.segments && data.segments.length > 0) {
      setTranscriptionData((prev) => {
        if (!prev) {
          // First transcription
          return {
            segments: data.segments,
            text: data.text || '',
            final: data.final || false,
          };
        } else {
          // Append new segments (backend already deduplicated)
          return {
            segments: [...prev.segments, ...data.segments],
            text: prev.text + (prev.text && data.text ? ' ' : '') + (data.text || ''),
            final: data.final || false,
          };
        }
      });
    } else if (data.final && data.segments && data.segments.length === 0) {
      // Empty final message - just mark as final
      setTranscriptionData((prev) => ({
        ...prev,
        final: true,
      }));
    }
  };

  // Handle status messages
  const handleStatus = (message) => {
    setStatusMessage(message);
  };

  // Handle successful save
  const handleSave = (data) => {
    console.log('Transcription saved:', data);
    setStatusMessage('Transcription saved to database!');

    setTimeout(() => {
      setStatusMessage('');
    }, 3000);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>WhisperX Transcription</h1>
          <p className="subtitle">Real-time audio transcription with AI review</p>
        </div>
        {statusMessage && (
          <div className="status-banner">
            {statusMessage}
          </div>
        )}
      </header>

      <main className="app-main">
        <div className="container">
          {/* Audio Recorder */}
          <AudioRecorder
            onTranscription={handleTranscription}
            onStatus={handleStatus}
            onRecordingStateChange={handleRecordingStateChange}
          />

          {/* Transcription Editor */}
          <TranscriptionEditor
            ref={editorRef}
            transcriptionData={transcriptionData}
            onSave={handleSave}
          />
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>
            Powered by WhisperX, Ollama AI, and Tailscale
          </p>
          <p className="footer-note">
            Transcriptions are saved to PostgreSQL and can be imported into Obsidian
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
