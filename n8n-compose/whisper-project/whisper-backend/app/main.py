"""
WhisperX Backend - Main FastAPI Application
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db, close_db
from app.whisper_service import get_whisper_service
from app.routers import transcription, websocket

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager

    Handles startup and shutdown events
    """
    # Startup
    logger.info("Starting WhisperX Backend...")

    try:
        # Initialize database
        logger.info("Initializing database...")
        await init_db()
        logger.info("Database initialized")

        # Initialize WhisperX service (load models)
        logger.info("Loading WhisperX models...")
        whisper_service = get_whisper_service()
        logger.info("WhisperX models loaded")

        logger.info("WhisperX Backend started successfully")

    except Exception as e:
        logger.error(f"Error during startup: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down WhisperX Backend...")

    try:
        await close_db()
        logger.info("Database connections closed")

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")

    logger.info("WhisperX Backend shut down")


# Create FastAPI app
app = FastAPI(
    title="WhisperX Backend",
    description="Audio transcription API with speaker diarization and AI review",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(transcription.router)
app.include_router(websocket.router)


@app.get("/")
async def root():
    """
    Root endpoint - health check
    """
    return {
        "service": "WhisperX Backend",
        "version": "0.1.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint

    Returns service status and component availability
    """
    from app.ollama_client import get_ollama_client

    ollama_client = get_ollama_client()
    ollama_available = await ollama_client.is_available()

    return {
        "status": "healthy",
        "database": "connected",
        "whisperx": "loaded",
        "ollama": "available" if ollama_available else "unavailable",
    }


@app.get("/api/info")
async def api_info():
    """
    Get API information and available models
    """
    from app.whisper_service import whisper_service

    return {
        "whisper_model": whisper_service.model_name if whisper_service else "not loaded",
        "device": whisper_service.device if whisper_service else "unknown",
        "speaker_diarization": whisper_service.diarize_model is not None if whisper_service else False,
        "endpoints": {
            "rest_api": "/api/transcriptions",
            "websocket": "/ws/transcribe",
            "health": "/health",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
