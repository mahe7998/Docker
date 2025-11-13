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
  const editorRef = useRef(null);

  // Handle incoming transcription from WebSocket
  const handleTranscription = (data) => {
    console.log('Received transcription data:', data);

    // Check if this is new data or appending to existing
    if (data.segments && data.segments.length > 0) {
      setTranscriptionData((prev) => {
        if (!prev) {
          // First transcription
          return {
            segments: data.segments,
            markdown: data.markdown || '',
            duration: data.duration || 0,
          };
        } else {
          // Append new segments
          return {
            segments: [...prev.segments, ...data.segments],
            markdown: prev.markdown + '\n\n' + (data.markdown || ''),
            duration: data.duration || prev.duration,
          };
        }
      });
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
