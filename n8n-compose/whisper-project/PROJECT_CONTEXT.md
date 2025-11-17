# WhisperX Transcription Project - Context

## Project Overview

Real-time audio transcription web application with AI-powered text enhancement. Built with MLX-Whisper for Apple Silicon GPU acceleration, React frontend, and Ollama AI for text processing.

**Repository**: mahe7998/Docker (whisper-project folder)

## Architecture

### Frontend (React + Vite)
- **Location**: `whisper-project/whisper-frontend/`
- **Stack**: React 18, TipTap editor, WebSocket for real-time transcription
- **Components**:
  - `AudioRecorder.jsx`: Captures audio and streams to backend via WebSocket
  - `TranscriptionEditor.jsx`: Rich text editor with AI review capabilities
  - `App.jsx`: Main component coordinating recorder and editor

### Backend (Python + FastAPI)
- **Location**: `~/projects/python/mlx_whisper/`
- **Stack**: FastAPI, MLX-Whisper, Ollama client, PostgreSQL
- **Services**:
  - `app/main.py`: WebSocket endpoint for real-time transcription
  - `app/whisper_service.py`: MLX-Whisper integration (Apple Silicon GPU)
  - `app/ollama_client.py`: AI text review (grammar, rephrase, summarize, improve)
  - `app/database.py`: PostgreSQL connection and models

### Database (PostgreSQL)
- **Container**: `whisper-db`
- **Credentials**: User: `whisper`, DB: `whisper`
- **Schema**:
  - Table: `transcriptions`
  - Fields: id, title, content_md, audio_file_path, duration_seconds, speaker_map, metadata, is_reviewed, timestamps

## Current Features

### ✅ Working Features

1. **Real-time Transcription**
   - Sliding window approach (5-second chunks)
   - Text accumulation without duplication
   - Live streaming to frontend via WebSocket
   - Fixed: Text accumulation bug (using `useCallback` for stable function refs)

2. **AI-Powered Text Enhancement**
   - Fix Grammar
   - Rephrase Professionally
   - Summarize
   - Improve Overall Quality
   - Fixed: Ollama client API compatibility (using `ollama.Client()`)

3. **AI Summary Proposal (NEW)**
   - Automatically generates summary when saving
   - Modal with editable summary textarea
   - User can accept, edit, or reject
   - Summary becomes transcription title
   - Smooth animations and UX

4. **Database Persistence**
   - Save transcriptions with AI-generated titles
   - PostgreSQL storage
   - Metadata tracking

## Recent Changes (Latest Session)

### Fixed Issues
1. **Text Accumulation Bug**
   - Problem: Text was being replaced instead of appended during real-time transcription
   - Root cause: `handleRecordingStateChange` function recreated on every render, triggering useEffect that cleared state
   - Solution: Wrapped in `useCallback` with empty dependency array (App.jsx:18)
   - Commit: `79605fa` (mahe7998/Docker)

2. **AI Review 500 Error**
   - Problem: "Rephrase" and other AI actions failed with HTTP 500
   - Root cause: `ollama.set_base_url()` doesn't exist in ollama library
   - Solution: Changed to `ollama.Client(host=base_url)` pattern
   - Files: `~/projects/python/mlx_whisper/app/ollama_client.py`
   - Commit: `6f8a2c1` (mahe7998/python)

3. **Added AI Summary Feature**
   - Auto-generates summary on save using Ollama
   - Modal UI for review/editing
   - Summary becomes transcription title
   - Files modified:
     - `TranscriptionEditor.jsx`: Modal state and handlers
     - `TranscriptionEditor.css`: Modal styling with animations
   - Commit: `84decc4` (mahe7998/Docker)

## How to Run

### Start Backend (MLX-Whisper)
```bash
cd ~/projects/python/mlx_whisper
./start.sh
# Runs on http://localhost:8000
```

### Start Frontend + Database (Docker Compose)
```bash
cd ~/projects/docker/n8n-compose/whisper-project
docker-compose up -d whisper-db whisper-frontend
# Frontend: http://localhost:3000 (proxied via traefik)
```

### Check Services
```bash
# Backend status
curl http://localhost:8000/health

# Database connection
docker-compose exec -T whisper-db psql -U whisper -d whisper -c "SELECT COUNT(*) FROM transcriptions;"

# Frontend container
docker-compose ps whisper-frontend
```

## Key Technical Decisions

### 1. Sliding Window Transcription
- 5-second audio chunks sent via WebSocket
- Backend deduplicates using text comparison
- Frontend accumulates text in `App.jsx` state
- TipTap editor appends new content only

### 2. React State Management
- Critical: Use `useCallback` for functions passed to child components with useEffect dependencies
- Prevents unnecessary re-renders and state clearing
- Pattern used in `App.jsx` line 18

### 3. Ollama Client Pattern
```python
# Correct pattern
self.client = ollama.Client(host=self.base_url)
models = await loop.run_in_executor(None, self.client.list)
response = await loop.run_in_executor(None, lambda: self.client.generate(...))
```

## Environment Variables

### Backend (.env or environment)
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://localhost:11434)
- `WHISPER_MODEL`: MLX model (default: mlx-community/whisper-base)
- `DATABASE_URL`: PostgreSQL connection string

### Frontend (Docker Compose)
- No specific env vars required (API endpoints hardcoded to localhost:8000)

## Database Schema

```sql
CREATE TABLE transcriptions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    title VARCHAR(255) NOT NULL,
    content_md TEXT NOT NULL,
    audio_file_path VARCHAR(500),
    duration_seconds FLOAT,
    speaker_map JSONB DEFAULT '{}',
    extra_metadata JSONB DEFAULT '{}',
    is_reviewed BOOLEAN DEFAULT FALSE
);
```

## Known Issues

### None Currently
All previously identified issues have been resolved:
- ✅ Text accumulation working
- ✅ AI review actions working
- ✅ Database saves working
- ✅ AI summary feature implemented

## Development Workflow

### Making Frontend Changes
```bash
cd ~/projects/docker/n8n-compose/whisper-project/whisper-frontend

# Edit files in src/
# ...

# Rebuild and deploy
docker-compose stop whisper-frontend
docker-compose rm -f whisper-frontend
docker-compose build --no-cache whisper-frontend
docker-compose up -d whisper-frontend

# Commit changes
git add src/
git commit -m "Description"
git push
```

### Making Backend Changes
```bash
cd ~/projects/python/mlx_whisper

# Edit files in app/
# ...

# Restart backend
pkill -f "uvicorn app.main:app"
sleep 2
./start.sh &

# Commit changes
git add app/
git commit -m "Description"
git push
```

## File Locations

### Frontend Repository (mahe7998/Docker)
- Path: `~/projects/docker/n8n-compose/whisper-project/whisper-frontend/`
- Key files:
  - `src/App.jsx`
  - `src/components/AudioRecorder.jsx`
  - `src/components/TranscriptionEditor.jsx`
  - `src/components/TranscriptionEditor.css`
  - `src/services/api.js`

### Backend Repository (mahe7998/python)
- Path: `~/projects/python/mlx_whisper/`
- Key files:
  - `app/main.py`
  - `app/whisper_service.py`
  - `app/ollama_client.py`
  - `app/models.py`
  - `app/database.py`

## Next Session Quick Start

1. **Check if services are running**:
   ```bash
   # Backend
   curl http://localhost:8000/health

   # Frontend
   docker-compose ps whisper-frontend

   # Database
   docker-compose exec -T whisper-db psql -U whisper -d whisper -c "\dt"
   ```

2. **Start services if needed**:
   ```bash
   # Backend
   cd ~/projects/python/mlx_whisper && ./start.sh &

   # Frontend + DB
   cd ~/projects/docker/n8n-compose/whisper-project
   docker-compose up -d whisper-db whisper-frontend
   ```

3. **Test the application**:
   - Open http://localhost:3000
   - Click "Start Recording"
   - Speak into microphone
   - Watch real-time transcription appear
   - Click "Stop Recording"
   - Click "Save to Database"
   - Review/edit AI-generated summary
   - Click "Save with this summary"

## Dependencies

### Frontend
- React 18
- TipTap (rich text editor)
- react-markdown
- Vite (build tool)

### Backend
- FastAPI
- mlx-whisper (Apple Silicon GPU acceleration)
- ollama (AI text processing)
- psycopg2 (PostgreSQL driver)
- sqlalchemy (ORM)

### Infrastructure
- PostgreSQL 15
- Docker & Docker Compose
- nginx (frontend serving)

## Performance Notes

- MLX-Whisper uses Apple Silicon GPU for transcription (much faster than CPU)
- Ollama runs locally for AI processing (privacy-focused)
- WebSocket for low-latency real-time streaming
- Frontend chunk size: 5 seconds (balance between latency and accuracy)

## Security Considerations

- Database password should be set via `WHISPER_DB_PASSWORD` env var
- Ollama runs locally (no external API calls for AI)
- Audio data processed locally (privacy-preserving)
- No authentication implemented (local development only)

---

**Last Updated**: 2025-11-17
**Version**: 1.0
**Status**: Production-ready for local use
