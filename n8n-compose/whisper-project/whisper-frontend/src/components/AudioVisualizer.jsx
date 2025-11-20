import { useEffect, useRef } from 'react';
import './AudioVisualizer.css';

/**
 * AudioVisualizer - Real-time audio volume visualization
 *
 * Shows a visual representation of audio input volume during recording
 */
const AudioVisualizer = ({ mediaStream, isRecording }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!mediaStream || !isRecording) {
      // Stop visualization when not recording
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    // Create audio context and analyser
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(mediaStream);

    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const draw = () => {
      if (!isRecording) return;

      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = 'rgb(20, 20, 30)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      const volumePercent = (average / 255) * 100;

      // Draw frequency bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;

        // Create gradient based on height
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        if (barHeight > canvas.height * 0.7) {
          gradient.addColorStop(0, '#ff4444');
          gradient.addColorStop(1, '#ff8844');
        } else if (barHeight > canvas.height * 0.4) {
          gradient.addColorStop(0, '#44ff44');
          gradient.addColorStop(1, '#88ff44');
        } else {
          gradient.addColorStop(0, '#4488ff');
          gradient.addColorStop(1, '#44ccff');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      // Draw volume meter on the right
      const meterX = canvas.width - 40;
      const meterWidth = 30;
      const meterHeight = canvas.height - 20;
      const meterY = 10;

      // Meter background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

      // Meter fill
      const fillHeight = (volumePercent / 100) * meterHeight;
      const meterGradient = ctx.createLinearGradient(0, meterY + meterHeight, 0, meterY);
      if (volumePercent > 70) {
        meterGradient.addColorStop(0, '#ff4444');
        meterGradient.addColorStop(1, '#ff8844');
      } else if (volumePercent > 40) {
        meterGradient.addColorStop(0, '#44ff44');
        meterGradient.addColorStop(1, '#88ff44');
      } else {
        meterGradient.addColorStop(0, '#4488ff');
        meterGradient.addColorStop(1, '#44ccff');
      }
      ctx.fillStyle = meterGradient;
      ctx.fillRect(meterX, meterY + meterHeight - fillHeight, meterWidth, fillHeight);

      // Meter border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [mediaStream, isRecording]);

  return (
    <div className="audio-visualizer">
      <canvas ref={canvasRef} className="visualizer-canvas" />
    </div>
  );
};

export default AudioVisualizer;
