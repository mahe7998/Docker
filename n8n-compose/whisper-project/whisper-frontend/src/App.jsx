/**
 * Main App Component
 * Combines AudioRecorder and TranscriptionEditor
 */
import { useState, useRef, useCallback } from 'react';
import AudioRecorder from './components/AudioRecorder';
import TranscriptionEditor from './components/TranscriptionEditor';
import TranscriptionSelector from './components/TranscriptionSelector';
import './App.css';

function App() {
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [isModified, setIsModified] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const editorRef = useRef(null);

  // Handle recording state changes
  // useCallback ensures this function reference stays stable across re-renders
  const handleRecordingStateChange = useCallback((recording) => {
    setIsRecording(recording);
    if (recording) {
      // Clear previous transcription when starting new recording
      setTranscriptionData(null);
    }
  }, []);

  // Handle incoming transcription from WebSocket
  const handleTranscription = (data) => {
    console.log('App.jsx received transcription:', {
      dataText: data.text,
      dataTextLength: data.text?.length,
      segmentsCount: data.segments?.length
    });

    // With the new sliding window approach, we always append new text
    // The backend handles deduplication and only sends new portions
    if (data.segments && data.segments.length > 0) {
      setTranscriptionData((prev) => {
        if (!prev) {
          // First transcription
          console.log('App.jsx: First transcription, text:', data.text);
          return {
            segments: data.segments,
            text: data.text || '',
            final: data.final || false,
          };
        } else {
          // Append new segments (backend already deduplicated)
          const newText = prev.text + (prev.text && data.text ? ' ' : '') + (data.text || '');
          console.log('App.jsx: Appending text. Previous length:', prev.text.length, 'New length:', newText.length);
          console.log('App.jsx: Accumulated text preview:', newText.substring(0, 150));
          return {
            segments: [...prev.segments, ...data.segments],
            text: newText,
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
    setIsModified(false);  // Reset modification flag after save
    setSelectedTranscription(data);  // Update selected transcription with saved data
    setRefreshTrigger(prev => prev + 1);  // Trigger refresh of transcription list

    setTimeout(() => {
      setStatusMessage('');
    }, 3000);
  };

  // Handle transcription selection from dropdown
  const handleTranscriptionSelect = async (transcription) => {
    if (transcription) {
      setSelectedTranscription(transcription);
      setTranscriptionData({
        text: transcription.current_content_md || transcription.content_md,
        segments: [],
        final: true,
      });
      setIsModified(false);
    } else {
      // Clear selection
      setSelectedTranscription(null);
      setTranscriptionData(null);
      setIsModified(false);
    }
  };

  // Handle transcription deletion
  const handleDelete = () => {
    setSelectedTranscription(null);
    setTranscriptionData(null);
    setIsModified(false);
    setRefreshTrigger(prev => prev + 1);  // Trigger refresh of transcription list
    setStatusMessage('Transcription deleted');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  // Handle content modification
  const handleContentChange = () => {
    setIsModified(true);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Thought Capture</h1>
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
          {/* Transcription Selector */}
          <TranscriptionSelector
            onSelect={handleTranscriptionSelect}
            disabled={isRecording}
            selectedId={selectedTranscription?.id}
            refreshTrigger={refreshTrigger}
          />

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
            selectedTranscription={selectedTranscription}
            isRecording={isRecording}
            isModified={isModified}
            onSave={handleSave}
            onDelete={handleDelete}
            onContentChange={handleContentChange}
          />
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>
            Powered by MLX-Whisper, Ollama AI, and Tailscale
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
