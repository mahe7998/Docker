/**
 * TranscriptionSelector Component
 * Dropdown for selecting previously saved transcriptions
 */
import { useState, useEffect } from 'react';
import { fetchTranscriptionSummaries, fetchTranscriptionById } from '../services/api';
import './TranscriptionSelector.css';

function TranscriptionSelector({ onSelect, disabled, selectedId, refreshTrigger }) {
  const [transcriptions, setTranscriptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch transcription summaries on component mount and when refreshTrigger changes
  useEffect(() => {
    loadTranscriptions();
  }, [refreshTrigger]);

  const loadTranscriptions = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchTranscriptionSummaries();
      setTranscriptions(data);
    } catch (err) {
      console.error('Error loading transcriptions:', err);
      setError('Failed to load transcriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = async (e) => {
    const transcriptionId = e.target.value;

    if (!transcriptionId) {
      // Clear selection
      onSelect(null);
      return;
    }

    try {
      setLoading(true);
      const transcription = await fetchTranscriptionById(transcriptionId);
      onSelect(transcription);
    } catch (err) {
      console.error('Error loading transcription:', err);
      setError('Failed to load transcription');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatOption = (t) => {
    const date = formatDate(t.last_modified_at || t.created_at);
    const edits = t.modification_count > 0 ? ` [${t.modification_count} edits]` : '';

    // Use content preview if title is generic (starts with "Transcription ")
    const isGenericTitle = t.title && t.title.startsWith('Transcription ');
    const displayText = isGenericTitle && t.content_preview
      ? t.content_preview + '...'
      : t.title;

    // Format: "Summary/Content - Date [edits]"
    return `${displayText} - ${date}${edits}`;
  };

  return (
    <div className="transcription-selector">
      <label htmlFor="transcription-select">
        Load Previous Transcription:
      </label>
      <select
        id="transcription-select"
        value={selectedId || ''}
        onChange={handleChange}
        disabled={disabled || loading}
        className={disabled ? 'disabled' : ''}
      >
        <option value="">-- New Transcription --</option>
        {transcriptions.map((t) => (
          <option key={t.id} value={t.id}>
            {formatOption(t)}
          </option>
        ))}
      </select>

      {loading && <span className="loading-indicator">Loading...</span>}
      {error && <span className="error-message">{error}</span>}

      {disabled && (
        <span className="disabled-message">
          Stop recording to select a transcription
        </span>
      )}
    </div>
  );
}

export default TranscriptionSelector;
