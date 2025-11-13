"""
SQLAlchemy models for WhisperX transcription system
"""
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from pydantic import BaseModel, Field

from app.database import Base


class Transcription(Base):
    """
    SQLAlchemy model for transcriptions table
    """
    __tablename__ = "transcriptions"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    title = Column(String(255), nullable=False, index=True)
    content_md = Column(Text, nullable=False)
    audio_file_path = Column(String(500), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    speaker_map = Column(JSONB, default={}, nullable=False)
    extra_metadata = Column(JSONB, default={}, nullable=False)
    is_reviewed = Column(Boolean, default=False, nullable=False, index=True)


# Pydantic schemas for API request/response validation

class TranscriptionBase(BaseModel):
    """Base schema for transcription data"""
    title: str = Field(..., min_length=1, max_length=255)
    content_md: str = Field(..., min_length=1)
    audio_file_path: Optional[str] = None
    duration_seconds: Optional[float] = None
    speaker_map: Dict[str, str] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_reviewed: bool = False


class TranscriptionCreate(TranscriptionBase):
    """Schema for creating a new transcription"""
    pass


class TranscriptionUpdate(BaseModel):
    """Schema for updating an existing transcription"""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    content_md: Optional[str] = Field(None, min_length=1)
    speaker_map: Optional[Dict[str, str]] = None
    metadata: Optional[Dict[str, Any]] = None
    is_reviewed: Optional[bool] = None


class TranscriptionResponse(TranscriptionBase):
    """Schema for transcription response"""
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TranscriptionListResponse(BaseModel):
    """Schema for list of transcriptions"""
    transcriptions: list[TranscriptionResponse]
    total: int
    page: int
    page_size: int


class WebSocketMessage(BaseModel):
    """Schema for WebSocket messages"""
    type: str  # "audio_chunk", "transcription", "status", "error"
    data: Any


class TranscriptionSegment(BaseModel):
    """Schema for a single transcription segment with speaker info"""
    speaker: str
    text: str
    start: float
    end: float
