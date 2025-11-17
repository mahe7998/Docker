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

const TranscriptionEditor = ({
  transcriptionData,
  selectedTranscription,
  isRecording,
  isModified,
  onSave,
  onDelete,
  onContentChange
}) => {
  const [title, setTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [proposedSummary, setProposedSummary] = useState('');

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
      // Notify parent of content changes
      if (onContentChange && selectedTranscription) {
        onContentChange();
      }
    },
  });

  // Track the last text we've added to avoid duplicates
  const lastTextRef = useRef('');
  // Track the currently loaded transcription ID
  const currentTranscriptionIdRef = useRef(null);

  // Load transcription data into editor (only for live/real-time transcription)
  useEffect(() => {
    // Only process real-time transcription data when NOT viewing a saved transcription
    if (transcriptionData && editor && !selectedTranscription) {
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
        isNew: fullText !== lastTextRef.current
      });

      // Only update if text has changed
      if (fullText && fullText !== lastTextRef.current) {
        if (!lastTextRef.current) {
          // First time - set all content
          console.log('First transcription - setting initial content');
          editor.commands.setContent(fullText);
          lastTextRef.current = fullText;
        } else if (fullText.length > lastTextRef.current.length) {
          // Append only new content
          const newContent = fullText.substring(lastTextRef.current.length);
          console.log('Appending new content:', newContent.substring(0, 50));

          // Move to end and insert new content
          editor.chain().focus('end').insertContent(newContent).run();
          lastTextRef.current = fullText;
        } else {
          // Text is shorter - new session, replace everything
          console.log('New session - replacing all content');
          editor.commands.setContent(fullText);
          lastTextRef.current = fullText;
        }
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

      // Destroy and recreate editor content
      editor.commands.setContent(content, false);
      lastTextRef.current = content;
      currentTranscriptionIdRef.current = selectedTranscription.id;

      // Load title
      setTitle(selectedTranscription.title || '');
    } else {
      // Clear editor when no transcription is selected
      console.log('Clearing editor - no transcription selected');
      editor.commands.setContent('', false);
      lastTextRef.current = '';
      currentTranscriptionIdRef.current = null;
      setTitle('');
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

    setIsAiProcessing(true);
    setAiAction(action);

    try {
      const result = await transcriptionAPI.aiReview(text, action);

      // Replace editor content with AI result
      editor.commands.setContent(result.result);

      setIsAiProcessing(false);
      setAiAction('');
    } catch (error) {
      console.error('AI review error:', error);
      alert(`AI review failed: ${error.message}`);
      setIsAiProcessing(false);
      setAiAction('');
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

    setSaveStatus('Generating summary...');
    setIsAiProcessing(true);

    try {
      // Generate AI summary for the title
      const result = await transcriptionAPI.aiReview(contentMd, 'summarize');
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
        result = await transcriptionAPI.update(selectedTranscription.id, updateData);
        setSaveStatus('Updated!');
      } else {
        // Create new transcription
        const createData = {
          title: proposedSummary,
          content_md: contentMd,
          duration_seconds: transcriptionData?.duration || 0,
          speaker_map: {},
          metadata: {
            created_via: 'web_interface',
          },
        };
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

  // Clear editor
  const handleClear = () => {
    if (confirm('Clear all content?')) {
      editor?.commands.setContent('');
      setTitle('');
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

      {/* AI Toolbar */}
      <div className="ai-toolbar">
        <span className="toolbar-label">AI Actions:</span>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('fix_grammar')}
          disabled={isAiProcessing}
        >
          {isAiProcessing && aiAction === 'fix_grammar' ? 'Processing...' : 'Fix Grammar'}
        </button>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('rephrase')}
          disabled={isAiProcessing}
        >
          {isAiProcessing && aiAction === 'rephrase' ? 'Processing...' : 'Rephrase'}
        </button>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('summarize')}
          disabled={isAiProcessing}
        >
          {isAiProcessing && aiAction === 'summarize' ? 'Processing...' : 'Summarize'}
        </button>
        <button
          className="btn btn-small btn-ai"
          onClick={() => handleAiReview('improve')}
          disabled={isAiProcessing}
        >
          {isAiProcessing && aiAction === 'improve' ? 'Processing...' : 'Improve'}
        </button>
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
          {isAiProcessing ? 'Generating summary...' :
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
    </div>
  );
};

export default TranscriptionEditor;
