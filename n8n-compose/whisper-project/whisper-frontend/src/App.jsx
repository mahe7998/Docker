/**
 * Main App Component
 * Combines AudioRecorder and TranscriptionEditor
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import AudioRecorder from './components/AudioRecorder';
import TranscriptionEditor from './components/TranscriptionEditor';
import TranscriptionSelector from './components/TranscriptionSelector';
import SettingsDialog from './components/SettingsDialog';
import './App.css';

function App() {
  const [transcriptionData, setTranscriptionData] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [isModified, setIsModified] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [audioFilePath, setAudioFilePath] = useState(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState(null);  // Duration from backend
  const [hasUnsavedRecording, setHasUnsavedRecording] = useState(false);  // Track if current recording is unsaved
  const [showSettings, setShowSettings] = useState(false);  // Settings dialog visibility
  const [settings, setSettings] = useState({ language: 'auto', ollamaModel: '' });  // App settings
  const editorRef = useRef(null);
  const isSelectingTranscriptionRef = useRef(false);  // Prevent audioUrl overwrite during selection

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('whisper-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setSettings(parsed);
        console.log('[App.jsx] Loaded settings from localStorage:', parsed);
      }
    } catch (error) {
      console.error('[App.jsx] Error loading settings:', error);
    }
  }, []);

  // Handle settings change
  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings);
    console.log('[App.jsx] Settings updated:', newSettings);
  };

  // Handle recording state changes
  // useCallback ensures this function reference stays stable across re-renders
  const handleRecordingStateChange = useCallback((recording, audioUrl, selectedTranscriptionWithAudio, durationSeconds) => {
    setIsRecording(recording);
    if (recording) {
      // Only clear if starting a completely new recording (no loaded transcription with audio)
      // A transcription must have an audio_file_path to be resumable
      if (!selectedTranscriptionWithAudio) {
        setTranscriptionData(null);
        setAudioFilePath(null);
        setAudioDurationSeconds(null);
      }
      // If resuming an existing transcription that has audio, keep the data and ID
    } else if (audioUrl) {
      // Skip if we're in the middle of selecting a different transcription
      // This prevents the old session's audioUrl from overwriting the newly selected one
      if (isSelectingTranscriptionRef.current) {
        console.log('[App.jsx] Skipping audioUrl update - transcription selection in progress');
        return;
      }
      // Recording stopped - save audio URL and duration from backend
      setAudioFilePath(audioUrl);
      setHasUnsavedRecording(true);  // Mark as unsaved
      if (durationSeconds !== null && durationSeconds !== undefined) {
        console.log('App.jsx: Setting audio duration from backend:', durationSeconds, 'seconds');
        setAudioDurationSeconds(durationSeconds);
      }
    }
  }, []);

  // Handle incoming transcription from WebSocket
  // useCallback ensures stable function reference to prevent listener re-registration
  const handleTranscription = useCallback((data) => {
    console.log('App.jsx received transcription:', {
      dataText: data.text,
      dataTextLength: data.text?.length,
      segmentsCount: data.segments?.length,
      isFinal: data.final
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
      console.log('App.jsx: Empty final message - marking transcription as final');
      setTranscriptionData((prev) => ({
        ...prev,
        final: true,
      }));
    }
  }, []);

  // Handle status messages
  // useCallback ensures stable function reference
  const handleStatus = useCallback((message) => {
    setStatusMessage(message);
  }, []);

  // Handle successful save
  const handleSave = (data) => {
    console.log('Transcription saved:', data);
    console.log('Audio file path from saved data:', data.audio_file_path);
    setStatusMessage('Transcription saved to database!');
    setIsModified(false);  // Reset modification flag after save
    setHasUnsavedRecording(false);  // Clear unsaved recording flag after save
    setSelectedTranscription(data);  // Update selected transcription with saved data
    setRefreshTrigger(prev => prev + 1);  // Trigger refresh of transcription list

    // Update audioFilePath if the saved transcription has audio
    // This enables audio concatenation for subsequent recordings
    if (data.audio_file_path) {
      console.log('Setting audioFilePath to:', data.audio_file_path);
      setAudioFilePath(data.audio_file_path);
    } else {
      console.log('No audio_file_path in saved data - concatenation will not work');
    }

    setTimeout(() => {
      setStatusMessage('');
    }, 3000);
  };

  // Handle transcription selection from dropdown
  const handleTranscriptionSelect = async (transcription) => {
    // Check for unsaved changes before switching
    if (transcription && (hasUnsavedRecording || isModified) && !selectedTranscription) {
      // We have an unsaved new recording and user is trying to load a different transcription
      const confirmed = window.confirm(
        'You have an unsaved recording. If you switch to a different transcription, your current recording and transcription will be lost.\n\nDo you want to continue?'
      );
      if (!confirmed) {
        return;  // User cancelled, don't switch
      }
    } else if (transcription && isModified && selectedTranscription && transcription.id !== selectedTranscription.id) {
      // User modified an existing transcription and is switching to another
      const confirmed = window.confirm(
        'You have unsaved changes to this transcription. If you switch to a different transcription, your changes will be lost.\n\nDo you want to continue?'
      );
      if (!confirmed) {
        return;  // User cancelled, don't switch
      }
    } else if (!transcription && (hasUnsavedRecording || isModified)) {
      // User selecting "New Transcription" but has unsaved changes
      const confirmed = window.confirm(
        'You have unsaved changes. If you start a new transcription, your current recording and transcription will be lost.\n\nDo you want to continue?'
      );
      if (!confirmed) {
        return;  // User cancelled, don't switch
      }
    }

    // Set flag to prevent audioUrl overwrite from useEffect
    isSelectingTranscriptionRef.current = true;

    if (transcription) {
      console.log('[App.jsx] Selected transcription:', transcription.id);
      console.log('[App.jsx] audio_file_path:', transcription.audio_file_path);
      console.log('[App.jsx] duration_seconds:', transcription.duration_seconds);
      setSelectedTranscription(transcription);
      setTranscriptionData({
        text: transcription.current_content_md || transcription.content_md,
        segments: [],
        final: true,
      });
      setAudioFilePath(transcription.audio_file_path || null);
      setAudioDurationSeconds(transcription.duration_seconds || null);
      setIsModified(false);
      setHasUnsavedRecording(false);  // Clear unsaved flag when loading saved transcription
    } else {
      // Clear selection (starting new)
      console.log('[App.jsx] Starting new transcription - clearing all state');
      setSelectedTranscription(null);
      setTranscriptionData(null);
      setAudioFilePath(null);
      setAudioDurationSeconds(null);
      setIsModified(false);
      setHasUnsavedRecording(false);
    }

    // Clear the flag after state updates have been scheduled
    // Use setTimeout to ensure React has processed the state updates
    setTimeout(() => {
      isSelectingTranscriptionRef.current = false;
    }, 100);
  };

  // Handle transcription deletion
  const handleDelete = () => {
    setSelectedTranscription(null);
    setTranscriptionData(null);
    setAudioFilePath(null);
    setAudioDurationSeconds(null);
    setIsModified(false);
    setRefreshTrigger(prev => prev + 1);  // Trigger refresh of transcription list
    setStatusMessage('Transcription deleted');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  // Handle content modification
  const handleContentChange = () => {
    setIsModified(true);
  };

  // Handle clear (from TranscriptionEditor Clear button)
  const handleClear = () => {
    setTranscriptionData(null);
    setAudioFilePath(null);
    setAudioDurationSeconds(null);
    setIsModified(false);
    setHasUnsavedRecording(false);
    // Don't clear selectedTranscription - user might want to keep the selection
    // but just clear the content
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
            loadedAudioPath={audioFilePath}
            audioDuration={selectedTranscription?.duration_seconds}
            resumeTranscriptionId={selectedTranscription?.id}
            language={settings.language}
          />

          {/* Transcription Editor */}
          <TranscriptionEditor
            ref={editorRef}
            transcriptionData={transcriptionData}
            selectedTranscription={selectedTranscription}
            isRecording={isRecording}
            isModified={isModified}
            audioFilePath={audioFilePath}
            audioDurationSeconds={audioDurationSeconds}
            onSave={handleSave}
            onDelete={handleDelete}
            onContentChange={handleContentChange}
            onClear={handleClear}
            ollamaModel={settings.ollamaModel}
            language={settings.language}
            onOpenSettings={() => setShowSettings(true)}
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

      {/* Settings Dialog */}
      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
}

export default App;
