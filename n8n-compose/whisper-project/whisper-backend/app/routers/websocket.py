"""
WebSocket router for real-time audio streaming and transcription
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
    Buffer for accumulating audio chunks before transcription
    """

    def __init__(self, sample_rate: int = 16000):
        self.chunks: List[bytes] = []
        self.sample_rate = sample_rate
        self.total_duration = 0.0
        self.chunk_duration_threshold = 5.0  # Transcribe every 5 seconds

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

        Returns:
            True if ready to transcribe
        """
        return self.total_duration >= self.chunk_duration_threshold

    def get_combined_audio(self) -> bytes:
        """
        Combine all chunks into single audio file

        Returns:
            Combined audio bytes
        """
        if not self.chunks:
            return b""

        # Combine all chunks
        combined = b"".join(self.chunks)
        return combined

    def clear(self):
        """Clear buffer"""
        self.chunks = []
        self.total_duration = 0.0


@router.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    """
    WebSocket endpoint for real-time audio transcription

    Protocol:
    - Client sends: {"type": "audio_chunk", "data": <base64_audio>, "duration": <seconds>}
    - Client sends: {"type": "end_recording"}
    - Server sends: {"type": "transcription", "segments": [...]}
    - Server sends: {"type": "status", "message": "..."}
    - Server sends: {"type": "error", "message": "..."}
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

                    # Check if we should transcribe
                    if audio_buffer.should_transcribe():
                        await websocket.send_json({
                            "type": "status",
                            "message": "Transcribing..."
                        })

                        # Save combined audio to file
                        combined_audio = audio_buffer.get_combined_audio()
                        audio_filename = f"{session_id}_{int(audio_buffer.total_duration)}.wav"
                        audio_path = audio_dir / audio_filename

                        # Write audio file
                        with open(audio_path, "wb") as f:
                            f.write(combined_audio)

                        # Transcribe
                        try:
                            segments = await whisper_service.transcribe_audio(str(audio_path))

                            # Send transcription results
                            await websocket.send_json({
                                "type": "transcription",
                                "segments": [
                                    {
                                        "speaker": seg.speaker,
                                        "text": seg.text,
                                        "start": seg.start,
                                        "end": seg.end,
                                    }
                                    for seg in segments
                                ],
                            })

                            logger.info(f"Sent transcription: {len(segments)} segments")

                        except Exception as e:
                            logger.error(f"Transcription error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"Transcription failed: {str(e)}"
                            })

                        # Clear buffer
                        audio_buffer.clear()

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

                    # Save and transcribe remaining audio
                    combined_audio = audio_buffer.get_combined_audio()
                    audio_filename = f"{session_id}_final.wav"
                    audio_path = audio_dir / audio_filename

                    with open(audio_path, "wb") as f:
                        f.write(combined_audio)

                    try:
                        segments = await whisper_service.transcribe_audio(str(audio_path))

                        await websocket.send_json({
                            "type": "transcription",
                            "segments": [
                                {
                                    "speaker": seg.speaker,
                                    "text": seg.text,
                                    "start": seg.start,
                                    "end": seg.end,
                                }
                                for seg in segments
                            ],
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
