"""
WebSocket router for real-time audio streaming and transcription

Implements sliding window algorithm with 50% overlap:
- Frontend sends 3-second audio chunks
- Backend accumulates 2 chunks (6 seconds) before transcribing
- Keeps last chunk as overlap for next window
- Deduplicates segments from overlapping regions
- Provides better accuracy by giving WhisperX context at window boundaries
"""
import logging
import asyncio
import json
from typing import List
import uuid
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydub import AudioSegment
import io

from app.whisper_service import get_whisper_service
from app.models import TranscriptionSegment

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


class AudioBuffer:
    """
    Buffer for accumulating audio chunks with sliding window overlap
    """

    def __init__(self, sample_rate: int = 16000, chunk_size_seconds: float = 3.0):
        self.chunks: List[bytes] = []
        self.sample_rate = sample_rate
        self.chunk_size_seconds = chunk_size_seconds
        self.total_duration = 0.0
        self.chunk_duration_threshold = chunk_size_seconds * 2  # Need 2 chunks (6 seconds)
        self.last_transcribed_end_time = 0.0  # Track absolute time position in recording
        self.window_count = 0  # Track number of windows processed

    def add_chunk(self, audio_data: bytes, duration: float):
        """
        Add audio chunk to buffer

        Args:
            audio_data: Audio bytes
            duration: Duration of chunk in seconds
        """
        self.chunks.append(audio_data)
        self.total_duration += duration

    def should_transcribe(self) -> bool:
        """
        Check if buffer has enough audio to transcribe
        Need at least 2 chunks for sliding window

        Returns:
            True if ready to transcribe
        """
        return self.total_duration >= self.chunk_duration_threshold

    def get_sliding_window_audio(self) -> bytes:
        """
        Get audio for current sliding window (last 2 chunks)

        Returns:
            Combined audio bytes from last 2 chunks
        """
        if not self.chunks:
            return b""

        if len(self.chunks) < 2:
            # First window - use whatever we have
            return b"".join(self.chunks)

        # Return last 2 chunks (6 seconds total for 50% overlap)
        return b"".join(self.chunks[-2:])

    def get_combined_audio(self) -> bytes:
        """
        Combine all chunks into single audio file (for final transcription)

        Returns:
            Combined audio bytes
        """
        if not self.chunks:
            return b""

        # Combine all chunks
        combined = b"".join(self.chunks)
        return combined

    def keep_last_chunk(self):
        """
        Keep only the last chunk for next sliding window
        This creates the overlap - last chunk becomes first chunk of next window
        """
        if len(self.chunks) >= 2:
            self.chunks = self.chunks[-1:]
            self.total_duration = self.chunk_size_seconds
            self.window_count += 1
        # If only 1 chunk, keep it

    def clear(self):
        """Clear buffer completely"""
        self.chunks = []
        self.total_duration = 0.0
        # Don't reset last_transcribed_end_time - we need it for absolute timestamps


def filter_new_segments(
    segments: List[TranscriptionSegment],
    overlap_threshold: float,
    absolute_time_offset: float
) -> List[TranscriptionSegment]:
    """
    Filter segments to only include new portions (after overlap region)
    and adjust timestamps to be absolute from recording start

    Args:
        segments: All segments from current transcription window
        overlap_threshold: Time threshold - segments starting before this are duplicates
        absolute_time_offset: Offset to add to timestamps for absolute time

    Returns:
        New segments with adjusted absolute timestamps
    """
    new_segments = []
    for seg in segments:
        # Only keep segments that start at or after the overlap threshold
        if seg.start >= overlap_threshold:
            # Adjust timestamps to be absolute from recording start
            adjusted_segment = TranscriptionSegment(
                speaker=seg.speaker,
                text=seg.text,
                start=seg.start + absolute_time_offset,
                end=seg.end + absolute_time_offset,
            )
            new_segments.append(adjusted_segment)

    return new_segments


@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint for real-time audio transcription with sliding window

    Protocol:
    - Client sends: {"type": "audio_chunk", "data": <base64_audio>, "duration": <seconds>}
    - Client sends: {"type": "end_recording"}
    - Server sends: {"type": "transcription", "segments": [...]}
    - Server sends: {"type": "status", "message": "..."}
    - Server sends: {"type": "error", "message": "..."}

    Sliding Window Behavior:
    - Accumulates 2 chunks (6s) before first transcription
    - Subsequent transcriptions every 3s with 50% overlap
    - Automatically deduplicates overlapping segments
    - Maintains absolute timestamps across all segments
    """
    await websocket.accept()
    logger.info("WebSocket connection established")

    whisper_service = get_whisper_service()
    audio_buffer = AudioBuffer()
    session_id = str(uuid.uuid4())
    audio_dir = Path("/audio")
    audio_dir.mkdir(exist_ok=True)

    try:
        # Send welcome message
        await websocket.send_json({
            "type": "status",
            "message": "Connected. Ready to receive audio.",
            "session_id": session_id,
        })

        while True:
            # Receive message from client
            try:
                data = await websocket.receive_json()
            except Exception as e:
                logger.error(f"Error receiving WebSocket message: {e}")
                break

            message_type = data.get("type")

            if message_type == "audio_chunk":
                # Process audio chunk
                try:
                    import base64

                    # Decode base64 audio data
                    audio_b64 = data.get("data", "")
                    audio_bytes = base64.b64decode(audio_b64)
                    duration = data.get("duration", 0.0)

                    # Add to buffer
                    audio_buffer.add_chunk(audio_bytes, duration)

                    logger.info(f"Received audio chunk: {len(audio_bytes)} bytes, {duration}s")

                    # Check if we should transcribe (have 2 chunks = 6 seconds)
                    if audio_buffer.should_transcribe():
                        await websocket.send_json({
                            "type": "status",
                            "message": "Transcribing..."
                        })

                        # Get sliding window audio (last 2 chunks)
                        window_audio = audio_buffer.get_sliding_window_audio()
                        audio_filename = f"{session_id}_window_{audio_buffer.window_count}.wav"
                        audio_path = audio_dir / audio_filename

                        # Write audio file
                        with open(audio_path, "wb") as f:
                            f.write(window_audio)

                        # Transcribe
                        try:
                            segments = await whisper_service.transcribe_audio(str(audio_path))

                            # Determine which segments are new (deduplication)
                            if audio_buffer.window_count > 0:
                                # Not first window - filter out overlapping segments
                                # First chunk (3s) is overlap, only keep segments from second chunk
                                overlap_threshold = audio_buffer.chunk_size_seconds
                                new_segments = filter_new_segments(
                                    segments,
                                    overlap_threshold,
                                    audio_buffer.last_transcribed_end_time
                                )
                                logger.info(
                                    f"Window {audio_buffer.window_count}: "
                                    f"Filtered {len(segments)} -> {len(new_segments)} new segments "
                                    f"(overlap threshold: {overlap_threshold}s)"
                                )
                            else:
                                # First window - send all segments with absolute timestamps
                                new_segments = filter_new_segments(
                                    segments,
                                    0.0,  # No overlap on first window
                                    0.0   # No time offset
                                )
                                logger.info(f"First window: {len(new_segments)} segments")

                            # Send only new transcription segments
                            if new_segments:
                                await websocket.send_json({
                                    "type": "transcription",
                                    "segments": [
                                        {
                                            "speaker": seg.speaker,
                                            "text": seg.text,
                                            "start": seg.start,
                                            "end": seg.end,
                                        }
                                        for seg in new_segments
                                    ],
                                })

                                logger.info(f"Sent {len(new_segments)} new segments")

                                # Update absolute time tracker
                                audio_buffer.last_transcribed_end_time += audio_buffer.chunk_size_seconds

                        except Exception as e:
                            logger.error(f"Transcription error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Transcription failed: {str(e)}"
                            })

                        # Keep last chunk for next sliding window (creates overlap)
                        audio_buffer.keep_last_chunk()

                except Exception as e:
                    logger.error(f"Error processing audio chunk: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Error processing audio: {str(e)}"
                    })

            elif message_type == "end_recording":
                # Process any remaining audio in buffer
                logger.info("End recording signal received")

                if audio_buffer.chunks:
                    await websocket.send_json({
                        "type": "status",
                        "message": "Processing final audio..."
                    })

                    # Get all remaining audio (may be 1 or 2 chunks)
                    remaining_audio = audio_buffer.get_combined_audio()
                    audio_filename = f"{session_id}_final.wav"
                    audio_path = audio_dir / audio_filename

                    with open(audio_path, "wb") as f:
                        f.write(remaining_audio)

                    try:
                        segments = await whisper_service.transcribe_audio(str(audio_path))

                        # Filter final segments - if we have a previous window,
                        # first chunk is overlap
                        if audio_buffer.window_count > 0 and len(audio_buffer.chunks) >= 2:
                            # Multiple chunks remaining - first is overlap
                            overlap_threshold = audio_buffer.chunk_size_seconds
                            new_segments = filter_new_segments(
                                segments,
                                overlap_threshold,
                                audio_buffer.last_transcribed_end_time
                            )
                            logger.info(f"Final window: Filtered {len(segments)} -> {len(new_segments)} new segments")
                        elif audio_buffer.window_count > 0:
                            # Only one chunk remaining - it's all overlap from previous window
                            # So we already sent this in the last window
                            new_segments = []
                            logger.info("Final window: Single chunk is overlap, no new segments")
                        else:
                            # First and only window - send everything
                            new_segments = filter_new_segments(segments, 0.0, 0.0)
                            logger.info(f"Final window (first): {len(new_segments)} segments")

                        # Send final segments if any
                        if new_segments:
                            await websocket.send_json({
                                "type": "transcription",
                                "segments": [
                                    {
                                        "speaker": seg.speaker,
                                        "text": seg.text,
                                        "start": seg.start,
                                        "end": seg.end,
                                    }
                                    for seg in new_segments
                                ],
                                "final": True,
                            })
                            logger.info(f"Sent {len(new_segments)} final segments")
                        else:
                            # No new segments, just send final marker
                            await websocket.send_json({
                                "type": "transcription",
                                "segments": [],
                                "final": True,
                            })

                    except Exception as e:
                        logger.error(f"Final transcription error: {e}")
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Final transcription failed: {str(e)}"
                        })

                # Send completion message
                await websocket.send_json({
                    "type": "status",
                    "message": "Recording completed. Transcription finished."
                })

                audio_buffer.clear()

            elif message_type == "ping":
                # Keepalive ping
                await websocket.send_json({"type": "pong"})

            else:
                logger.warning(f"Unknown message type: {message_type}")
                await websocket.send_json({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Server error: {str(e)}"
            })
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
        logger.info("WebSocket connection closed")
