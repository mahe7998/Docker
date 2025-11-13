"""
WhisperX service for audio transcription with speaker diarization
"""
import os
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor

import whisperx
import torch
from pyannote.audio import Pipeline

from app.models import TranscriptionSegment

logger = logging.getLogger(__name__)

# Global executor for running CPU/GPU bound tasks
executor = ThreadPoolExecutor(max_workers=2)


class WhisperXService:
    """
    Service for handling WhisperX transcription with speaker diarization
    """

    def __init__(
        self,
        model_name: str = "base",
        device: str = "mps",  # mps for Apple Silicon, cuda for NVIDIA, cpu for CPU-only
        compute_type: str = "float32",
        hf_token: Optional[str] = None,
    ):
        """
        Initialize WhisperX service

        Args:
            model_name: WhisperX model name (tiny, base, small, medium, large-v2)
            device: Device to run on (mps, cuda, cpu)
            compute_type: Computation type (float32, float16, int8)
            hf_token: HuggingFace token for speaker diarization models
        """
        self.model_name = model_name
        self.device = device
        self.compute_type = compute_type
        self.hf_token = hf_token or os.getenv("HF_TOKEN")

        # Set device based on availability
        if device == "mps" and not torch.backends.mps.is_available():
            logger.warning("MPS not available, falling back to CPU")
            self.device = "cpu"
        elif device == "cuda" and not torch.cuda.is_available():
            logger.warning("CUDA not available, falling back to CPU")
            self.device = "cpu"

        self.model = None
        self.align_model = None
        self.align_metadata = None
        self.diarize_model = None

        logger.info(f"Initialized WhisperX service with model={model_name}, device={device}")

    def load_models(self):
        """Load WhisperX models (call this during startup)"""
        try:
            # Load transcription model
            logger.info(f"Loading WhisperX model: {self.model_name}")
            self.model = whisperx.load_model(
                self.model_name,
                self.device,
                compute_type=self.compute_type,
            )
            logger.info("WhisperX transcription model loaded successfully")

            # Load alignment model
            logger.info("Loading alignment model")
            self.align_model, self.align_metadata = whisperx.load_align_model(
                language_code="en",
                device=self.device,
            )
            logger.info("Alignment model loaded successfully")

            # Load diarization model (requires HuggingFace token)
            if self.hf_token:
                logger.info("Loading speaker diarization model")
                self.diarize_model = Pipeline.from_pretrained(
                    "pyannote/speaker-diarization-3.1",
                    use_auth_token=self.hf_token,
                )
                # Move to device if available
                if self.device != "cpu":
                    self.diarize_model.to(torch.device(self.device))
                logger.info("Diarization model loaded successfully")
            else:
                logger.warning("No HF_TOKEN provided, speaker diarization disabled")

        except Exception as e:
            logger.error(f"Error loading WhisperX models: {e}")
            raise

    def _transcribe_sync(self, audio_path: str) -> Dict[str, Any]:
        """
        Synchronous transcription (runs in thread pool)

        Args:
            audio_path: Path to audio file

        Returns:
            Transcription result dictionary
        """
        try:
            logger.info(f"Transcribing audio: {audio_path}")

            # Transcribe with WhisperX
            audio = whisperx.load_audio(audio_path)
            result = self.model.transcribe(audio, batch_size=16)

            # Align whisper output
            if self.align_model:
                result = whisperx.align(
                    result["segments"],
                    self.align_model,
                    self.align_metadata,
                    audio,
                    self.device,
                    return_char_alignments=False,
                )

            # Add speaker diarization
            if self.diarize_model:
                # Pyannote Pipeline expects file path
                diarize_segments = self.diarize_model(audio_path)
                result = whisperx.assign_word_speakers(diarize_segments, result)

            logger.info(f"Transcription completed: {len(result.get('segments', []))} segments")
            return result

        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            raise

    async def transcribe_audio(self, audio_path: str) -> List[TranscriptionSegment]:
        """
        Transcribe audio file with speaker diarization

        Args:
            audio_path: Path to audio file

        Returns:
            List of transcription segments with speaker information
        """
        # Run transcription in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(executor, self._transcribe_sync, audio_path)

        # Convert to TranscriptionSegment objects
        segments = []
        for seg in result.get("segments", []):
            segment = TranscriptionSegment(
                speaker=seg.get("speaker", "UNKNOWN"),
                text=seg.get("text", "").strip(),
                start=seg.get("start", 0.0),
                end=seg.get("end", 0.0),
            )
            segments.append(segment)

        return segments

    def format_as_markdown(
        self,
        segments: List[TranscriptionSegment],
        speaker_map: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        Format transcription segments as markdown

        Args:
            segments: List of transcription segments
            speaker_map: Optional mapping of speaker IDs to names

        Returns:
            Formatted markdown text
        """
        if not segments:
            return ""

        speaker_map = speaker_map or {}
        markdown_lines = []

        current_speaker = None
        for segment in segments:
            speaker_id = segment.speaker
            speaker_name = speaker_map.get(speaker_id, speaker_id)

            # Add speaker label if changed
            if speaker_id != current_speaker:
                if current_speaker is not None:
                    markdown_lines.append("")  # Blank line between speakers
                markdown_lines.append(f"**{speaker_name}**: {segment.text}")
                current_speaker = speaker_id
            else:
                # Continue same speaker
                markdown_lines.append(segment.text)

        return "\n".join(markdown_lines)

    async def save_audio_chunk(self, audio_data: bytes, filename: str) -> str:
        """
        Save audio chunk to file

        Args:
            audio_data: Audio data bytes
            filename: Output filename

        Returns:
            Path to saved file
        """
        audio_dir = Path("/audio")
        audio_dir.mkdir(exist_ok=True)

        file_path = audio_dir / filename
        with open(file_path, "wb") as f:
            f.write(audio_data)

        logger.info(f"Saved audio file: {file_path}")
        return str(file_path)


# Global service instance
whisper_service: Optional[WhisperXService] = None


def get_whisper_service() -> WhisperXService:
    """
    Get or create WhisperX service instance

    Returns:
        WhisperXService instance
    """
    global whisper_service
    if whisper_service is None:
        # Initialize with default settings
        # Adjust model_name based on your needs: tiny, base, small, medium, large-v2
        whisper_service = WhisperXService(
            model_name=os.getenv("WHISPER_MODEL", "base"),
            device=os.getenv("WHISPER_DEVICE", "mps"),  # mps for Apple Silicon
            compute_type="float32",
            hf_token=os.getenv("HF_TOKEN"),
        )
        whisper_service.load_models()

    return whisper_service
