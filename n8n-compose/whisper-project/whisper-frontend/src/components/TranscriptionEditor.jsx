/**
 * TranscriptionEditor Component
 * TipTap-based rich text editor with markdown support and AI review
 */
import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import { transcriptionAPI } from '../services/api';
import ReactMarkdown from 'react-markdown';
import './TranscriptionEditor.css';

// Language code to display name mapping
const LANGUAGE_NAMES = {
  auto: 'Auto-detect',
  en: 'English',
  zh: 'Chinese',
  es: 'Spanish',
  hi: 'Hindi',
  ar: 'Arabic',
  pt: 'Portuguese',
  bn: 'Bengali',
  ru: 'Russian',
  ja: 'Japanese',
  pa: 'Punjabi',
  de: 'German',
  jv: 'Javanese',
  ko: 'Korean',
  fr: 'French',
  te: 'Telugu',
  vi: 'Vietnamese',
  mr: 'Marathi',
  ta: 'Tamil',
  tr: 'Turkish',
  it: 'Italian',
  th: 'Thai',
  gu: 'Gujarati',
  pl: 'Polish',
  uk: 'Ukrainian',
  ml: 'Malayalam',
  kn: 'Kannada',
  or: 'Oriya',
  ro: 'Romanian',
  nl: 'Dutch',
  hu: 'Hungarian',
  el: 'Greek',
  cs: 'Czech',
  sv: 'Swedish',
  fi: 'Finnish',
  id: 'Indonesian',
  he: 'Hebrew',
  no: 'Norwegian',
  da: 'Danish',
  sk: 'Slovak',
  bg: 'Bulgarian',
  ms: 'Malay',
  hr: 'Croatian',
  sr: 'Serbian',
  ca: 'Catalan',
  lt: 'Lithuanian',
  sl: 'Slovenian',
  lv: 'Latvian',
  et: 'Estonian',
  fa: 'Persian',
  sw: 'Swahili',
};

const TranscriptionEditor = ({
  transcriptionData,
  selectedTranscription,
  isRecording,
  isModified,
  audioFilePath,
  audioDurationSeconds,
  onSave,
  onDelete,
  onContentChange,
  onClear,
  ollamaModel,
  language,
  onOpenSettings
}) => {
  const [title, setTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [proposedSummary, setProposedSummary] = useState('');
  const [showRetranscribeModal, setShowRetranscribeModal] = useState(false);
  const [retranscribeStatus, setRetranscribeStatus] = useState('');
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const [retranscribeProgress, setRetranscribeProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const progressIntervalRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Transcription will appear here...',
      }),
      Typography,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none',
      },
    },
    onUpdate: () => {
      // Only notify parent of content changes if this is a user edit (not programmatic)
      if (onContentChange && selectedTranscription && !isProgrammaticUpdateRef.current) {
        onContentChange();
      }
    },
  });

  // Track the last text we've added to avoid duplicates
  const lastTextRef = useRef('');
  // Track the currently loaded transcription ID
  const currentTranscriptionIdRef = useRef(null);
  // Track if we just loaded a transcription to avoid processing stale data
  const justLoadedTranscriptionRef = useRef(false);
  // Track if we're programmatically updating content (not user edits)
  const isProgrammaticUpdateRef = useRef(false);

  // Load transcription data into editor (real-time transcription)
  useEffect(() => {
    // Skip processing if we just loaded a saved transcription (prevent stale data duplication)
    if (justLoadedTranscriptionRef.current) {
      console.log('Skipping stale transcriptionData after loading saved transcription');
      justLoadedTranscriptionRef.current = false;
      return;
    }

    // Process real-time transcription data and append to existing content
    if (transcriptionData && editor) {
      const { text, segments, markdown } = transcriptionData;

      // Use text field (from sliding window approach), or markdown, or build from segments
      let fullText = text || markdown || '';
      if (!fullText && segments) {
        // No speaker labels - just concatenate text
        fullText = segments.map(seg => seg.text).join(' ');
      }

      // Debug logging
      console.log('TranscriptionEditor received:', {
        fullTextLength: fullText.length,
        lastTextLength: lastTextRef.current.length,
        fullTextPreview: fullText.substring(0, 100),
        isNew: fullText !== lastTextRef.current,
        hasSelectedTranscription: !!selectedTranscription
      });

      // Only update if text has changed
      if (fullText && fullText !== lastTextRef.current) {
        isProgrammaticUpdateRef.current = true;

        if (!lastTextRef.current) {
          // First time receiving transcription in this session
          if (selectedTranscription) {
            // We have a loaded transcription, append new content to the end
            console.log('Appending first transcription chunk to selected transcription');
            editor.chain().focus('end').insertContent(' ' + fullText).run();
          } else {
            // No loaded transcription, set all content
            console.log('First transcription - setting initial content');
            editor.commands.setContent(fullText);
          }
          lastTextRef.current = fullText;
        } else if (fullText.length > lastTextRef.current.length) {
          // Append only new content
          const newContent = fullText.substring(lastTextRef.current.length);
          console.log('Appending new content:', newContent.substring(0, 50));

          // Move to end and insert new content
          editor.chain().focus('end').insertContent(newContent).run();
          lastTextRef.current = fullText;
        } else {
          // Text is shorter - new recording session starting
          console.log('New recording session - resetting transcription tracking');
          lastTextRef.current = '';
        }

        // Reset flag after a brief delay to allow update to complete
        setTimeout(() => {
          isProgrammaticUpdateRef.current = false;
        }, 100);
      }

      // Set title if not already set
      if (!title) {
        const now = new Date();
        setTitle(`Transcription ${now.toLocaleString()}`);
      }
    }
  }, [transcriptionData, editor, title, selectedTranscription]);

  // Load selected transcription into editor
  useEffect(() => {
    if (!editor) return;

    if (selectedTranscription) {
      console.log('Loading selected transcription:', selectedTranscription.id);

      // Load content from selected transcription
      const content = selectedTranscription.content_md || '';

      // Mark as programmatic update to prevent triggering isModified
      isProgrammaticUpdateRef.current = true;

      // Destroy and recreate editor content
      editor.commands.setContent(content, false);
      // Reset lastTextRef so new recording will append to this content
      lastTextRef.current = '';
      currentTranscriptionIdRef.current = selectedTranscription.id;
      // Mark that we just loaded a transcription to skip stale transcriptionData
      justLoadedTranscriptionRef.current = true;

      // Load title
      setTitle(selectedTranscription.title || '');

      // Reset flag after a brief delay
      setTimeout(() => {
        isProgrammaticUpdateRef.current = false;
      }, 100);
    } else {
      // Clear editor when no transcription is selected
      console.log('Clearing editor - no transcription selected');

      // Mark as programmatic update
      isProgrammaticUpdateRef.current = true;

      editor.commands.setContent('', false);
      lastTextRef.current = '';
      currentTranscriptionIdRef.current = null;
      justLoadedTranscriptionRef.current = false;
      setTitle('');

      // Reset flag after a brief delay
      setTimeout(() => {
        isProgrammaticUpdateRef.current = false;
      }, 100);
    }
  }, [selectedTranscription, editor]);

  // Append new transcription segments
  const appendSegments = (segments) => {
    if (!editor || !segments) return;

    // No speaker labels - just concatenate text
    const content = segments.map(seg => seg.text).join(' ');

    // Append to existing content
    const currentContent = editor.getHTML();
    editor.commands.setContent(currentContent + ' ' + content);
  };

  // AI Review Actions
  const handleAiReview = async (action) => {
    if (!editor) return;

    const text = editor.getText();
    if (!text.trim()) {
      alert('Please enter some text first');
      return;
    }

    // Warn user if text is very large
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 5000) {
      const estimatedMinutes = Math.ceil((wordCount * 0.37 + 60) / 60);
      if (!confirm(`This is a large text (${wordCount} words). Processing may take up to ${estimatedMinutes} minutes. Continue?`)) {
        return;
      }
    }

    setIsAiProcessing(true);
    setAiAction(action);
    setSaveStatus(`Processing ${wordCount} words...`);

    try {
      const result = await transcriptionAPI.aiReview(text, action, ollamaModel || null);

      // Replace editor content with AI result
      editor.commands.setContent(result.result);

      setIsAiProcessing(false);
      setAiAction('');
      setSaveStatus('Processing complete!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (error) {
      console.error('AI review error:', error);

      // Provide more helpful error messages
      let errorMessage = 'AI review failed';
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = `Request timed out. The text (${wordCount} words) may be too large. Try processing a smaller section.`;
      } else if (error.response?.status === 503) {
        errorMessage = 'AI service is not available. Please check if Ollama is running.';
      } else {
        errorMessage = `AI review failed: ${error.message}`;
      }

      alert(errorMessage);
      setIsAiProcessing(false);
      setAiAction('');
      setSaveStatus('');
    }
  };

  // Get saved transcription speed from localStorage (seconds of audio per second of processing)
  const getSavedTranscriptionSpeed = () => {
    try {
      const saved = localStorage.getItem('whisper-transcription-speed');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.speed || 10; // Default: 10 seconds of audio per 1 second of processing
      }
    } catch (e) {
      console.warn('Could not load transcription speed:', e);
    }
    return 10; // Default speed
  };

  // Save transcription speed to localStorage
  const saveTranscriptionSpeed = (audioDurationSecs, processingTimeSecs) => {
    // Only save if audio is longer than 30 seconds for accurate measurement
    if (audioDurationSecs < 30) {
      console.log('Audio too short to save speed estimate');
      return;
    }
    try {
      const speed = audioDurationSecs / processingTimeSecs;
      localStorage.setItem('whisper-transcription-speed', JSON.stringify({
        speed,
        audioDuration: audioDurationSecs,
        processingTime: processingTimeSecs,
        savedAt: new Date().toISOString()
      }));
      console.log(`Saved transcription speed: ${speed.toFixed(2)}x (${audioDurationSecs.toFixed(1)}s audio in ${processingTimeSecs.toFixed(1)}s)`);
    } catch (e) {
      console.warn('Could not save transcription speed:', e);
    }
  };

  // Handle re-transcription of the entire audio file
  const handleRetranscribe = async () => {
    if (!audioFilePath) {
      alert('No audio file available to re-transcribe');
      return;
    }

    // Show confirmation
    if (!confirm('This will replace the current transcription with a fresh transcription of the entire audio file. Continue?')) {
      return;
    }

    setShowRetranscribeModal(true);
    setIsRetranscribing(true);
    setRetranscribeProgress(0);

    try {
      // Use duration from prop (already loaded by audio player) instead of API call
      const duration = audioDurationSeconds || 0;

      // Use saved speed if available, otherwise default to 10x realtime
      const savedSpeed = getSavedTranscriptionSpeed();
      const estimatedSeconds = duration > 0 ? Math.max(5, duration / savedSpeed) : 30;

      setAudioDuration(duration);
      setEstimatedTime(estimatedSeconds);

      const formatDuration = (secs) => {
        const mins = Math.floor(secs / 60);
        const remainingSecs = Math.floor(secs % 60);
        return mins > 0 ? `${mins}m ${remainingSecs}s` : `${remainingSecs}s`;
      };

      setRetranscribeStatus(`Transcribing ${formatDuration(duration)} of audio (estimated ~${formatDuration(estimatedSeconds)})...`);

      // Start a timer-based progress animation
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        // Progress follows a curve that approaches 95% asymptotically
        const progress = Math.min(95, (elapsed / estimatedSeconds) * 90);
        setRetranscribeProgress(progress);
      }, 200);

      const result = await transcriptionAPI.retranscribe(audioFilePath, language);

      // Stop the progress timer
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Calculate actual processing time and save speed for future estimates
      // Use duration from result (actual transcribed audio length) for accurate speed calculation
      const actualProcessingTime = (Date.now() - startTime) / 1000;
      const actualDuration = result.duration || duration;
      saveTranscriptionSpeed(actualDuration, actualProcessingTime);

      // Set to 100%
      setRetranscribeProgress(100);

      // Replace editor content with new transcription
      if (editor && result.text) {
        isProgrammaticUpdateRef.current = true;
        editor.commands.setContent(result.text);
        lastTextRef.current = result.text;

        // Reset flag after update
        setTimeout(() => {
          isProgrammaticUpdateRef.current = false;
        }, 100);
      }

      setRetranscribeStatus('Transcription complete!');
      setTimeout(() => {
        setShowRetranscribeModal(false);
        setIsRetranscribing(false);
        setRetranscribeStatus('');
        setRetranscribeProgress(0);
      }, 1500);

    } catch (error) {
      console.error('Re-transcription error:', error);
      // Stop the progress timer on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setRetranscribeStatus(`Error: ${error.message}`);
      setIsRetranscribing(false);
    }
  };

  // Generate summary and show modal before saving
  const handleSave = async () => {
    if (!editor) return;

    const contentMd = editor.getText();
    if (!contentMd.trim()) {
      alert('Cannot save empty transcription');
      return;
    }

    // If updating existing transcription, use existing title (allow user to edit)
    if (selectedTranscription) {
      setProposedSummary(selectedTranscription.title || title);
      setShowSummaryModal(true);
      return;
    }

    // For new transcriptions, generate AI summary
    setSaveStatus('Generating summary...');
    setIsAiProcessing(true);

    try {
      // Generate AI summary for the title
      const result = await transcriptionAPI.aiReview(contentMd, 'summarize', ollamaModel || null);
      const summary = result.result.trim();

      // Show modal with proposed summary
      setProposedSummary(summary);
      setShowSummaryModal(true);
      setSaveStatus('');
      setIsAiProcessing(false);
    } catch (error) {
      console.error('Summary generation error:', error);
      setSaveStatus('');
      setIsAiProcessing(false);

      // If AI summary fails, ask user to provide title manually
      alert('AI summary generation failed. Please provide a title manually.');
    }
  };

  // Actually save to database with confirmed title
  const handleConfirmSave = async () => {
    if (!editor) return;

    const contentMd = editor.getText();
    if (!contentMd.trim()) {
      alert('Cannot save empty transcription');
      return;
    }

    if (!proposedSummary.trim()) {
      alert('Please provide a title for the transcription');
      return;
    }

    setShowSummaryModal(false);
    setSaveStatus('Saving...');

    try {
      let result;

      if (selectedTranscription) {
        // Update existing transcription
        const updateData = {
          content_md: contentMd,
          title: proposedSummary,
        };
        // If there's new audio (from resume recording), update audio path and duration
        if (audioFilePath && audioFilePath !== selectedTranscription.audio_file_path) {
          updateData.audio_file_path = audioFilePath;
          console.log('Updating audio_file_path to:', audioFilePath);
        }
        if (audioDurationSeconds && audioDurationSeconds !== selectedTranscription.duration_seconds) {
          updateData.duration_seconds = audioDurationSeconds;
          console.log('Updating duration_seconds to:', audioDurationSeconds);
        }
        result = await transcriptionAPI.update(selectedTranscription.id, updateData);
        setSaveStatus('Updated!');
      } else {
        // Create new transcription
        // Use audioDurationSeconds from backend (includes concatenated duration for resume)
        const createData = {
          title: proposedSummary,
          content_md: contentMd,
          duration_seconds: audioDurationSeconds || 0,
          speaker_map: {},
          audio_file_path: audioFilePath,
          metadata: {
            created_via: 'web_interface',
          },
        };
        console.log('Creating transcription with duration:', audioDurationSeconds, 'audio_file_path:', audioFilePath);
        result = await transcriptionAPI.create(createData);
        setSaveStatus('Saved!');
      }

      // Update the title field with the saved summary
      setTitle(proposedSummary);

      if (onSave) {
        onSave(result);
      }

      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('Save failed');
      alert(`Failed to save: ${error.message}`);
    }
  };

  // Handle delete transcription
  const handleDeleteClick = async () => {
    if (!selectedTranscription) return;

    if (!confirm(`Are you sure you want to delete "${selectedTranscription.title}"?`)) {
      return;
    }

    setSaveStatus('Deleting...');

    try {
      await transcriptionAPI.delete(selectedTranscription.id);
      setSaveStatus('Deleted!');

      if (onDelete) {
        onDelete();
      }

      setTimeout(() => {
        setSaveStatus('');
      }, 2000);
    } catch (error) {
      console.error('Delete error:', error);
      setSaveStatus('Delete failed');
      alert(`Failed to delete: ${error.message}`);
    }
  };

  // Cancel save and close modal
  const handleCancelSave = () => {
    setShowSummaryModal(false);
    setProposedSummary('');
  };

  // Clear editor and audio
  const handleClear = () => {
    if (confirm('Clear all content and audio?')) {
      editor?.commands.setContent('');
      setTitle('');
      // Notify parent to clear audio as well
      if (onClear) {
        onClear();
      }
    }
  };

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="transcription-editor">
      <div className="editor-header">
        <input
          type="text"
          className="title-input"
          placeholder="Transcription title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="editor-actions">
          <button
            className="btn btn-small"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
          {saveStatus && <span className="save-status">{saveStatus}</span>}
        </div>
      </div>

      {/* AI Toolbar with Settings */}
      <div className="ai-toolbar">
        <span className="toolbar-label">AI Actions:</span>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('fix_grammar')}
          disabled={isAiProcessing || isRetranscribing}
        >
          {isAiProcessing && aiAction === 'fix_grammar' ? 'Processing...' : 'Fix Grammar'}
        </button>
        <button
          className="btn btn-small btn-retranscribe"
          onClick={handleRetranscribe}
          disabled={isAiProcessing || isRetranscribing || !audioFilePath}
          title={!audioFilePath ? 'No audio file available' : 'Re-transcribe the entire audio file'}
        >
          {isRetranscribing ? 'Transcribing...' : 'Re-transcribe'}
        </button>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('rephrase')}
          disabled={isAiProcessing || isRetranscribing}
        >
          {isAiProcessing && aiAction === 'rephrase' ? 'Processing...' : 'Rephrase'}
        </button>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('improve')}
          disabled={isAiProcessing || isRetranscribing}
        >
          {isAiProcessing && aiAction === 'improve' ? 'Processing...' : 'Improve'}
        </button>

        <span className="toolbar-divider"></span>

        <span className="settings-inline">
          <span className="settings-item">
            <span className="settings-label">Lang:</span>
            <span className="settings-value">{LANGUAGE_NAMES[language] || language || 'Auto'}</span>
          </span>
          <span className="settings-item">
            <span className="settings-label">Model:</span>
            <span className="settings-value">{ollamaModel || 'Default'}</span>
          </span>
          <button
            className="btn btn-tiny btn-settings"
            onClick={onOpenSettings}
            title="Open Settings"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </span>
      </div>

      {/* Editor or Preview */}
      <div className="editor-container">
        {!showPreview ? (
          <EditorContent editor={editor} className="editor-content" />
        ) : (
          <div className="markdown-preview">
            <ReactMarkdown>{editor.getText()}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="editor-footer">
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!editor.getText().trim() || isAiProcessing}
        >
          {isAiProcessing && aiAction === 'summarize' ? 'Generating summary...' :
           isAiProcessing ? 'Processing...' :
           selectedTranscription && isModified ? 'Update Transcription' : 'Save to Database'}
        </button>

        {selectedTranscription && (
          <button
            className="btn btn-danger"
            onClick={handleDeleteClick}
            disabled={isRecording || isModified}
            title={isRecording ? 'Stop recording to delete' :
                   isModified ? 'Save changes before deleting' : 'Delete this transcription'}
          >
            Delete
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>

      {/* Summary Confirmation Modal */}
      {showSummaryModal && (
        <div className="modal-overlay" onClick={handleCancelSave}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Summary</h3>
            <p>AI has generated this summary for your transcription:</p>
            <textarea
              className="summary-input"
              value={proposedSummary}
              onChange={(e) => setProposedSummary(e.target.value)}
              rows={4}
              placeholder="Edit summary or provide your own..."
            />
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={handleConfirmSave}
                disabled={!proposedSummary.trim()}
              >
                Save with this summary
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCancelSave}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Re-transcribe Progress Modal */}
      {showRetranscribeModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-progress" onClick={(e) => e.stopPropagation()}>
            <h3>Re-transcribing Audio</h3>
            <div className="progress-container">
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${retranscribeProgress}%` }}
                ></div>
              </div>
              <p className="progress-percentage">{Math.round(retranscribeProgress)}%</p>
              <p className="progress-status">{retranscribeStatus}</p>
            </div>
            {!isRetranscribing && (
              <div className="modal-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowRetranscribeModal(false);
                    setRetranscribeStatus('');
                    setRetranscribeProgress(0);
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TranscriptionEditor;
