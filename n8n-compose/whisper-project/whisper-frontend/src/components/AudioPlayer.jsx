import { useState, useRef, useEffect } from 'react';
import './AudioPlayer.css';

/**
 * AudioPlayer - Simple audio playback component for recorded WebM files
 */
const AudioPlayer = ({ audioUrl, durationSeconds }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('[AudioPlayer] Loading audio - URL:', audioUrl);
    console.log('[AudioPlayer] Duration from database:', durationSeconds);

    // Reset state when URL changes
    setCurrentTime(0);
    setIsPlaying(false);

    // Use provided duration if available (from database), otherwise try to detect from metadata
    if (durationSeconds && durationSeconds > 0) {
      console.log('[AudioPlayer] Using database duration:', durationSeconds, 'seconds');
      setDuration(durationSeconds);
    } else {
      console.log('[AudioPlayer] No database duration - will need to load metadata from file');
      setDuration(0);
    }

    const loadStartTime = performance.now();

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      // Only use browser metadata if we don't have duration from database
      if (!durationSeconds || durationSeconds === 0) {
        if (audio.duration && isFinite(audio.duration)) {
          const loadTime = performance.now() - loadStartTime;
          console.log('[AudioPlayer] Duration loaded from metadata:', audio.duration, 'seconds (took', loadTime.toFixed(0), 'ms)');
          setDuration(audio.duration);
        } else {
          setDuration(0);
        }
      }
    };
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      console.error('[AudioPlayer] Audio playback error:', audio.error);
      setHasError(true);
      setIsPlaying(false);
    };
    const handleCanPlay = () => {
      const loadTime = performance.now() - loadStartTime;
      console.log('[AudioPlayer] Audio can play (took', loadTime.toFixed(0), 'ms since load started)');
      setHasError(false);
      updateDuration();
    };
    // Keep event listeners for performance but with timing logs
    const handleLoadStart = () => {
      console.log('[AudioPlayer] Load started at', performance.now().toFixed(0), 'ms');
    };
    const handleLoadedMetadata = () => {
      const loadTime = performance.now() - loadStartTime;
      console.log('[AudioPlayer] Metadata loaded (took', loadTime.toFixed(0), 'ms)');
    };
    const handleLoadedData = () => {
      const loadTime = performance.now() - loadStartTime;
      console.log('[AudioPlayer] Data loaded (took', loadTime.toFixed(0), 'ms)');
    };
    const handleProgress = () => {
      // Track buffering progress for browser optimization
      if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(0);
        const bufferedPercent = audio.duration ? (bufferedEnd / audio.duration * 100) : 0;
      }
    };
    const handleWaiting = () => {};
    const handlePlaying = () => {};

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('progress', handleProgress);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    // Don't force load immediately - only load when user plays (preload="none")
    // This avoids downloading metadata for large files
    // audio.load();

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('progress', handleProgress);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
    };
  }, [audioUrl, durationSeconds]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('[AudioPlayer] Error playing audio:', error);
      setHasError(true);
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    // Only allow seeking if we have a valid duration
    if (!audio || hasError || !isFinite(duration) || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (seconds) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!audioUrl) return null;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={audioUrl} preload="none" />

      {hasError && (
        <div style={{ color: '#ff6b6b', padding: '10px', textAlign: 'center' }}>
          Audio file not available or cannot be played
        </div>
      )}

      {!hasError && (
        <>
          <div className="player-controls">
        <button
          className={`play-button ${isPlaying ? 'playing' : ''}`}
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6,4 20,12 6,20" />
            </svg>
          )}
        </button>

        <div className="time-display">{formatTime(currentTime)}</div>

        <div className="progress-container" onClick={handleSeek}>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
              }}
            />
          </div>
        </div>

        <div className="time-display">
          {duration > 0 ? formatTime(duration) : '--:--'}
        </div>
          </div>

          <div className="player-info">
            <span className="audio-format">WebM Audio Recording</span>
          </div>
        </>
      )}
    </div>
  );
};

export default AudioPlayer;
