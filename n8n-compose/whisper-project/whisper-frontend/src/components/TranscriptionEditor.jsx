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

const TranscriptionEditor = ({ transcriptionData, onSave }) => {
  const [title, setTitle] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

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
  });

  // Track the last text we've added to avoid duplicates
  const lastTextRef = useRef('');

  // Load transcription data into editor
  useEffect(() => {
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
  }, [transcriptionData, editor, title]);

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

  // Save transcription
  const handleSave = async () => {
    if (!editor) return;

    const contentMd = editor.getText();
    if (!contentMd.trim()) {
      alert('Cannot save empty transcription');
      return;
    }

    setSaveStatus('Saving...');

    try {
      const data = {
        title: title || 'Untitled Transcription',
        content_md: contentMd,
        duration_seconds: transcriptionData?.duration || 0,
        speaker_map: {},
        metadata: {
          created_via: 'web_interface',
        },
      };

      await transcriptionAPI.create(data);
      setSaveStatus('Saved!');

      if (onSave) {
        onSave(data);
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
          disabled={!editor.getText().trim()}
        >
          Save to Database
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default TranscriptionEditor;
