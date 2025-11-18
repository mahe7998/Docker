# Thought Capture - Context

## Project Overview

Real-time audio transcription web application with AI-powered text enhancement and multiple model support. Built with MLX-Whisper for Apple Silicon GPU acceleration, React frontend, and Ollama AI for text processing.

**Repository**: mahe7998/Docker (whisper-project folder)
**Branding**: Renamed from "WhisperX Transcription" to "Thought Capture"

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
  - `app/routers/websocket.py`: WebSocket handler with model download optimization

### Database (PostgreSQL)
- **Container**: `whisper-db`
- **Credentials**: User: `whisper`, DB: `whisper`
- **Schema**:
  - Table: `transcriptions`
  - Fields: id, title, content_md, audio_file_path, duration_seconds, speaker_map, metadata, is_reviewed, timestamps

## Current Features

### ✅ Working Features

1. **Model Selection**
   - Choose between 6 Whisper models before recording:
     - Tiny (Fastest, 75MB) - Ultra-fast transcription
     - Base (Fast, 145MB) - Quick transcription
     - Small (Better, 483MB) - Better accuracy
     - Medium (Best, 1.5GB) - High quality transcription ✅ **NOW WORKING**
     - Large V3 (Highest Accuracy, 3GB) - Maximum accuracy
     - Turbo (Fast + Accurate, 809MB) - Best balance of speed and accuracy
   - Models download automatically on first use with size indicators
   - Status feedback during model download with progress tracking
   - Frontend waits for model to be ready before allowing recording
   - Model loads immediately when selected from dropdown

2. **Optimized Model Downloads** ✅ **NEW - 2025-11-18**
   - **Multi-threaded downloads** via `hf_transfer` library (8 concurrent threads)
   - **Automatic resume capability** - interrupted downloads continue from where they stopped
   - **XET download system bypassed** - fixes "CAS service error" at 99% issue
   - **Real-time progress tracking** showing actual MB downloaded and elapsed time
   - **Steady download speeds** - approximately 3-10 MB/s depending on network
   - **Reliable completion** - Medium (1.5GB) model downloads successfully in ~8-10 minutes

3. **Real-time Transcription**
   - Sliding window approach (5-second chunks)
   - Text accumulation without duplication
   - Live streaming to frontend via WebSocket
   - Fixed: Text accumulation bug (using `useCallback` for stable function refs)

4. **AI-Powered Text Enhancement**
   - Fix Grammar
   - Rephrase Professionally
   - Summarize
   - Improve Overall Quality
   - Fixed: Ollama client API compatibility (using `ollama.Client()`)

5. **AI Summary Proposal**
   - Automatically generates summary when saving
   - Modal with editable summary textarea
   - User can accept, edit, or reject
   - Summary becomes transcription title
   - Smooth animations and UX

6. **Database Persistence**
   - Save transcriptions with AI-generated titles
   - PostgreSQL storage
   - Metadata tracking

## Recent Changes (Latest Session - 2025-11-18)

### Major Fix: Large Model Download Issues ✅ RESOLVED

**Problem**: Medium model (1.5GB) downloads would consistently fail at 99% with "CAS service error" or get stuck after downloading ~1GB.

**Root Causes Identified**:
1. **Hugging Face XET download system bug** - The `HF_HUB_DISABLE_XET` environment variable is broken in `huggingface_hub` versions 0.34.1+ (known issue from July 2025)
2. **Single-threaded downloads** - Slow download speeds after initial CDN cache exhaustion
3. **File corruption** - XET system causing incomplete or corrupted downloads

**Solutions Implemented**:

1. **Uninstalled `hf-xet` package** (Critical Fix)
   - Command: `pip uninstall -y hf-xet`
   - Forces Hugging Face Hub to use regular HTTP downloads instead of XET
   - Bypasses the broken `HF_HUB_DISABLE_XET` environment variable
   - **Result**: Downloads now complete successfully without "CAS service error"

2. **Enabled `hf_transfer` for multi-threaded downloads**
   - Installed: `pip install hf_transfer`
   - Added to `websocket.py`: `os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"`
   - Uses 8 concurrent threads for faster large file downloads
   - **Result**: Improved download speeds from slow single-threaded to ~3-10 MB/s

3. **Enhanced progress monitoring**
   - Function: `get_incomplete_download_info()` in `websocket.py`
   - Shows actual MB downloaded every 3 seconds
   - Displays elapsed time
   - **Result**: User can see download is progressing steadily

**Files Modified**:
- Backend: `app/routers/websocket.py` - Added hf_transfer environment variable (line 50)
- Backend environment: Uninstalled `hf-xet` package from virtual environment

**Verification**:
- ✅ Medium model (1.5GB) now downloads at steady rate (~3-10 MB/s)
- ✅ No more "CAS service error" failures
- ✅ No more corruption or stuck downloads at 99%
- ✅ Downloads complete successfully in ~8-10 minutes
- ✅ Resume capability works perfectly if interrupted

### Previous Features (Still Working)

1. **Model Download with Resume Support**
   - Uses `huggingface_hub.snapshot_download` with automatic resume
   - Interrupted downloads automatically continue from where they stopped
   - Separate download and verification phases for better error handling
   - Status messages during model download:
     - "Preparing model download..."
     - "Downloading model... (290MB downloaded, 114s elapsed)"
     - "Verifying {model} model..."
     - "{model} ready!"
   - 10-minute timeout for large model downloads
   - Prevents recording until model is fully loaded

2. **Auto-load Default Model on Startup**
   - Default model (Tiny) loads automatically when app starts
   - User sees "Loading default model..." status on page load
   - No waiting when clicking "Start Recording" for the first time

## How to Run

### Start Backend (MLX-Whisper)
```bash
cd ~/projects/python/mlx_whisper
./start.sh
# Runs on http://localhost:8000
```

**Important**: Backend requires `hf-xet` to be **uninstalled** for reliable model downloads:
```bash
pip uninstall -y hf-xet
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

### 1. Hugging Face Model Download Optimization
- **XET disabled**: `hf-xet` package must be uninstalled (environment variable doesn't work)
- **Multi-threading enabled**: `HF_HUB_ENABLE_HF_TRANSFER=1` for faster downloads
- **Resume capability**: Built into `snapshot_download`, works automatically
- **Progress monitoring**: Custom function checks `.incomplete` files for size tracking

### 2. Sliding Window Transcription
- 5-second audio chunks sent via WebSocket
- Backend deduplicates using text comparison
- Frontend accumulates text in `App.jsx` state
- TipTap editor appends new content only

### 3. React State Management
- Critical: Use `useCallback` for functions passed to child components with useEffect dependencies
- Prevents unnecessary re-renders and state clearing
- Pattern used in `App.jsx` line 18

### 4. Ollama Client Pattern
```python
# Correct pattern
self.client = ollama.Client(host=self.base_url)
models = await loop.run_in_executor(None, self.client.list)
response = await loop.run_in_executor(None, lambda: self.client.generate(...))
```

## Environment Variables

### Backend (.env or environment)
- `OLLAMA_BASE_URL`: Ollama server URL (default: http://localhost:11434)
- `WHISPER_MODEL`: MLX model (default: mlx-community/whisper-tiny)
- `DATABASE_URL`: PostgreSQL connection string
- `HF_HUB_ENABLE_HF_TRANSFER`: Set to "1" for multi-threaded downloads (configured in code)
- `HF_HUB_DISABLE_XET`: Not used (broken in recent versions, use package uninstall instead)

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

### None Currently ✅
All previously identified issues have been resolved:
- ✅ Text accumulation working
- ✅ AI review actions working
- ✅ Database saves working
- ✅ AI summary feature implemented
- ✅ Model downloads working reliably (including large models like Medium)

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

### Backend Environment Setup
```bash
cd ~/projects/python/mlx_whisper
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install hf_transfer for fast downloads
pip install hf_transfer

# IMPORTANT: Uninstall hf-xet to avoid download issues
pip uninstall -y hf-xet
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
  - `src/services/websocket.js`

### Backend Repository (mahe7998/python)
- Path: `~/projects/python/mlx_whisper/`
- Key files:
  - `app/main.py`
  - `app/routers/websocket.py` - **Modified this session** (line 50: added hf_transfer)
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
   - Select desired model from dropdown (Tiny loads by default)
   - Click "Start Recording" once model is ready
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
- huggingface_hub (model downloading)
- hf_transfer (multi-threaded downloads) ✅ **NEW**
- **hf-xet must be UNINSTALLED** ✅ **CRITICAL**

### Infrastructure
- PostgreSQL 15
- Docker & Docker Compose
- nginx (frontend serving)

## Performance Notes

- MLX-Whisper uses Apple Silicon GPU for transcription (much faster than CPU)
- Ollama runs locally for AI processing (privacy-focused)
- WebSocket for low-latency real-time streaming
- Frontend chunk size: 5 seconds (balance between latency and accuracy)
- Model downloads: 3-10 MB/s with hf_transfer (8 concurrent threads)
- Medium model (1.5GB) downloads in approximately 8-10 minutes

## Security Considerations

- Database password should be set via `WHISPER_DB_PASSWORD` env var
- Ollama runs locally (no external API calls for AI)
- Audio data processed locally (privacy-preserving)
- No authentication implemented (local development only)

## Troubleshooting

### Model Downloads Failing at 99%
**Symptom**: Downloads get stuck or fail with "CAS service error"
**Solution**:
```bash
cd ~/projects/python/mlx_whisper
source venv/bin/activate
pip uninstall -y hf-xet
pkill -f "uvicorn app.main:app"
./start.sh
```

### Slow Model Downloads
**Symptom**: Downloads are very slow (< 1 MB/s)
**Solution**: Ensure `hf_transfer` is installed:
```bash
cd ~/projects/python/mlx_whisper
source venv/bin/activate
pip install hf_transfer
pkill -f "uvicorn app.main:app"
./start.sh
```

### Corrupted Model Files
**Symptom**: "Bad magic number for file header" error
**Solution**: Delete corrupted cache and re-download:
```bash
rm -rf ~/.cache/huggingface/hub/models--mlx-community--whisper-medium-mlx/
# Then select the model again in the frontend
```

---

**Last Updated**: 2025-11-18
**Version**: 1.2
**Status**: Production-ready for local use
**Major Achievement**: Large model downloads (1.5GB+) now work reliably ✅
