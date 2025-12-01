/**
 * SettingsDialog Component
 * Settings modal for transcription language and Ollama model selection
 */
import { useState, useEffect } from 'react';
import { transcriptionAPI } from '../services/api';
import './SettingsDialog.css';

// 50 most common languages supported by Whisper
const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'bn', name: 'Bengali' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'de', name: 'German' },
  { code: 'jv', name: 'Javanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'te', name: 'Telugu' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'tr', name: 'Turkish' },
  { code: 'it', name: 'Italian' },
  { code: 'th', name: 'Thai' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'pl', name: 'Polish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'or', name: 'Oriya' },
  { code: 'ro', name: 'Romanian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'el', name: 'Greek' },
  { code: 'cs', name: 'Czech' },
  { code: 'sv', name: 'Swedish' },
  { code: 'fi', name: 'Finnish' },
  { code: 'id', name: 'Indonesian' },
  { code: 'he', name: 'Hebrew' },
  { code: 'no', name: 'Norwegian' },
  { code: 'da', name: 'Danish' },
  { code: 'sk', name: 'Slovak' },
  { code: 'bg', name: 'Bulgarian' },
  { code: 'ms', name: 'Malay' },
  { code: 'hr', name: 'Croatian' },
  { code: 'sr', name: 'Serbian' },
  { code: 'ca', name: 'Catalan' },
  { code: 'lt', name: 'Lithuanian' },
  { code: 'sl', name: 'Slovenian' },
  { code: 'lv', name: 'Latvian' },
  { code: 'et', name: 'Estonian' },
  { code: 'fa', name: 'Persian' },
  { code: 'sw', name: 'Swahili' },
];

// Default context window size options (in words, roughly 1/4 of token count)
const CONTEXT_SIZE_OPTIONS = [
  { value: 0, label: 'Auto (use model default)' },
  { value: 1000, label: '1,000 words (~4K tokens)' },
  { value: 2000, label: '2,000 words (~8K tokens)' },
  { value: 4000, label: '4,000 words (~16K tokens)' },
  { value: 8000, label: '8,000 words (~32K tokens)' },
  { value: 16000, label: '16,000 words (~64K tokens)' },
  { value: 32000, label: '32,000 words (~128K tokens)' },
];

const SettingsDialog = ({ isOpen, onClose, settings, onSettingsChange }) => {
  const [language, setLanguage] = useState(settings?.language || 'auto');
  const [ollamaModel, setOllamaModel] = useState(settings?.ollamaModel || '');
  const [contextWords, setContextWords] = useState(settings?.contextWords || 0);
  const [modelContextLength, setModelContextLength] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isLoadingModelInfo, setIsLoadingModelInfo] = useState(false);
  const [modelError, setModelError] = useState(null);

  // Load available Ollama models when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadOllamaModels();
    }
  }, [isOpen]);

  // Load settings from props when they change
  useEffect(() => {
    if (settings) {
      setLanguage(settings.language || 'auto');
      setOllamaModel(settings.ollamaModel || '');
      setContextWords(settings.contextWords || 0);
    }
  }, [settings]);

  // Load model info when model changes
  useEffect(() => {
    if (ollamaModel) {
      loadModelInfo(ollamaModel);
    }
  }, [ollamaModel]);

  const loadModelInfo = async (modelName) => {
    if (!modelName) return;
    setIsLoadingModelInfo(true);
    try {
      const info = await transcriptionAPI.getOllamaModelInfo(modelName);
      setModelContextLength(info.context_length || null);
    } catch (error) {
      console.error('Failed to load model info:', error);
      setModelContextLength(null);
    } finally {
      setIsLoadingModelInfo(false);
    }
  };

  const loadOllamaModels = async () => {
    setIsLoadingModels(true);
    setModelError(null);
    try {
      const models = await transcriptionAPI.getOllamaModels();
      setAvailableModels(models);
      // If no model selected yet (check both local state and props), select the first one
      const savedModel = settings?.ollamaModel || ollamaModel;
      if (!savedModel && models.length > 0) {
        setOllamaModel(models[0].name);
      }
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
      setModelError('Failed to load models. Is Ollama running?');
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = () => {
    const newSettings = {
      language,
      ollamaModel,
      contextWords: contextWords || 0,
    };

    // Save to localStorage
    localStorage.setItem('whisper-settings', JSON.stringify(newSettings));

    // Notify parent
    if (onSettingsChange) {
      onSettingsChange(newSettings);
    }

    onClose();
  };

  const handleCancel = () => {
    // Reset to saved settings
    if (settings) {
      setLanguage(settings.language || 'auto');
      setOllamaModel(settings.ollamaModel || '');
      setContextWords(settings.contextWords || 0);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={handleCancel}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={handleCancel}>&times;</button>
        </div>

        <div className="settings-content">
          {/* Language Selection */}
          <div className="settings-section">
            <label className="settings-label">
              Transcription Language
              <span className="settings-hint">Force a specific language or auto-detect</span>
            </label>
            <select
              className="settings-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name} {lang.code !== 'auto' ? `(${lang.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Ollama Model Selection */}
          <div className="settings-section">
            <label className="settings-label">
              AI Model (Ollama)
              <span className="settings-hint">Model used for grammar, rephrase, and summarize</span>
            </label>
            {isLoadingModels ? (
              <div className="settings-loading">Loading models...</div>
            ) : modelError ? (
              <div className="settings-error">
                {modelError}
                <button className="retry-btn" onClick={loadOllamaModels}>Retry</button>
              </div>
            ) : (
              <select
                className="settings-select"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0 ? (
                  <option value="">No models available</option>
                ) : (
                  availableModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name} {model.size ? `(${model.size})` : ''}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>

          {/* Context Window Size */}
          <div className="settings-section">
            <label className="settings-label">
              Context Window Size
              <span className="settings-hint">
                Max text chunk size for AI processing
                {isLoadingModelInfo ? ' (loading...)' :
                  modelContextLength ? ` (model default: ${modelContextLength.toLocaleString()} tokens)` : ''}
              </span>
            </label>
            <select
              className="settings-select"
              value={contextWords}
              onChange={(e) => setContextWords(parseInt(e.target.value))}
            >
              {CONTEXT_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="settings-hint-small">
              Larger texts will be split into chunks for processing
            </span>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsDialog;
