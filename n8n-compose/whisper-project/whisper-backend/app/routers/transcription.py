"""
REST API router for transcription CRUD operations
"""
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models import (
    Transcription,
    TranscriptionCreate,
    TranscriptionUpdate,
    TranscriptionResponse,
    TranscriptionListResponse,
)
from app.whisper_service import get_whisper_service, WhisperXService
from app.ollama_client import get_ollama_client, OllamaClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transcriptions", tags=["transcriptions"])


@router.post("", response_model=TranscriptionResponse, status_code=201)
async def create_transcription(
    data: TranscriptionCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new transcription

    Args:
        data: Transcription data
        db: Database session

    Returns:
        Created transcription
    """
    try:
        transcription = Transcription(**data.model_dump())
        db.add(transcription)
        await db.commit()
        await db.refresh(transcription)

        logger.info(f"Created transcription: {transcription.id}")
        return transcription

    except Exception as e:
        await db.rollback()
        logger.error(f"Error creating transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=TranscriptionListResponse)
async def list_transcriptions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    reviewed_only: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    List transcriptions with pagination

    Args:
        page: Page number (1-indexed)
        page_size: Number of items per page
        reviewed_only: Filter by review status
        db: Database session

    Returns:
        List of transcriptions with pagination metadata
    """
    try:
        # Build query
        query = select(Transcription)

        if reviewed_only is not None:
            query = query.where(Transcription.is_reviewed == reviewed_only)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Apply pagination and ordering
        query = query.order_by(desc(Transcription.created_at))
        query = query.offset((page - 1) * page_size).limit(page_size)

        # Execute query
        result = await db.execute(query)
        transcriptions = result.scalars().all()

        return TranscriptionListResponse(
            transcriptions=transcriptions,
            total=total,
            page=page,
            page_size=page_size,
        )

    except Exception as e:
        logger.error(f"Error listing transcriptions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{transcription_id}", response_model=TranscriptionResponse)
async def get_transcription(
    transcription_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a specific transcription by ID

    Args:
        transcription_id: Transcription ID
        db: Database session

    Returns:
        Transcription data
    """
    try:
        result = await db.execute(
            select(Transcription).where(Transcription.id == transcription_id)
        )
        transcription = result.scalar_one_or_none()

        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")

        return transcription

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{transcription_id}", response_model=TranscriptionResponse)
async def update_transcription(
    transcription_id: int,
    data: TranscriptionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a transcription

    Args:
        transcription_id: Transcription ID
        data: Updated transcription data
        db: Database session

    Returns:
        Updated transcription
    """
    try:
        # Get existing transcription
        result = await db.execute(
            select(Transcription).where(Transcription.id == transcription_id)
        )
        transcription = result.scalar_one_or_none()

        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")

        # Update fields
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(transcription, field, value)

        await db.commit()
        await db.refresh(transcription)

        logger.info(f"Updated transcription: {transcription_id}")
        return transcription

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{transcription_id}", status_code=204)
async def delete_transcription(
    transcription_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a transcription

    Args:
        transcription_id: Transcription ID
        db: Database session
    """
    try:
        result = await db.execute(
            select(Transcription).where(Transcription.id == transcription_id)
        )
        transcription = result.scalar_one_or_none()

        if not transcription:
            raise HTTPException(status_code=404, detail="Transcription not found")

        await db.delete(transcription)
        await db.commit()

        logger.info(f"Deleted transcription: {transcription_id}")

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcribe", response_model=dict)
async def transcribe_audio_file(
    file: UploadFile = File(...),
    whisper_service: WhisperXService = Depends(get_whisper_service),
):
    """
    Transcribe an uploaded audio file

    Args:
        file: Audio file upload
        whisper_service: WhisperX service instance

    Returns:
        Transcription segments with speaker information
    """
    try:
        # Save uploaded file
        import uuid
        filename = f"{uuid.uuid4()}.{file.filename.split('.')[-1]}"
        audio_data = await file.read()
        audio_path = await whisper_service.save_audio_chunk(audio_data, filename)

        # Transcribe
        logger.info(f"Transcribing file: {filename}")
        segments = await whisper_service.transcribe_audio(audio_path)

        # Format as markdown
        markdown = whisper_service.format_as_markdown(segments)

        return {
            "segments": [seg.model_dump() for seg in segments],
            "markdown": markdown,
            "audio_path": audio_path,
            "duration": segments[-1].end if segments else 0.0,
        }

    except Exception as e:
        logger.error(f"Error transcribing audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-review", response_model=dict)
async def ai_review_text(
    text: str,
    action: str = Query(..., description="Action: fix_grammar, rephrase, summarize, improve, extract_actions"),
    ollama_client: OllamaClient = Depends(get_ollama_client),
):
    """
    Use Ollama AI to review/rewrite text

    Args:
        text: Text to review
        action: Action to perform
        ollama_client: Ollama client instance

    Returns:
        Reviewed/rewritten text
    """
    try:
        # Check if Ollama is available
        if not await ollama_client.is_available():
            raise HTTPException(
                status_code=503,
                detail="Ollama AI service is not available"
            )

        # Perform requested action
        if action == "fix_grammar":
            result = await ollama_client.fix_grammar(text)
        elif action == "rephrase":
            result = await ollama_client.rephrase_professionally(text)
        elif action == "summarize":
            result = await ollama_client.summarize(text)
        elif action == "improve":
            result = await ollama_client.improve_text(text)
        elif action == "extract_actions":
            result = await ollama_client.extract_action_items(text)
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown action: {action}"
            )

        logger.info(f"AI review completed: {action}")
        return {"original": text, "result": result, "action": action}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during AI review: {e}")
        raise HTTPException(status_code=500, detail=str(e))
