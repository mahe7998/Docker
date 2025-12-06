# Whisper Transcription System

A comprehensive real-time audio transcription system with AI-powered text review via Ollama, and Obsidian integration.

**Supports multiple backends:**
- **MLX-Whisper** on Apple Silicon (M1/M2/M3/M4 Macs)
- **CUDA-Whisper** on NVIDIA GPUs (RTX 3090/4090 etc.)

## Features

### Recording & Transcription
- **Real-time Streaming Transcription**: Browser-based audio recording with WebSocket streaming
- **Sliding Window Approach**: Continuous transcription with intelligent text deduplication
- **Start/Stop/Restart Recording**: Multiple recordings supported in the same session
- **Audio Concatenation**: Resume and append new audio to previous recordings
- **Model Selection**: Choose from whisper-tiny, base, small, medium, large-v3, or turbo models at runtime
- **Language Selection**: Force a specific language or auto-detect (50+ languages supported)
- **Stereo Channel Selection**: Transcribe left channel, right channel, or mix both to mono
- **Apple Silicon Optimized**: MLX acceleration for fast transcription on M1 or later Macs

### Audio Playback & Visualization
- **Live Audio Visualization**: Real-time waveform display during recording
- **Audio Player**: Full-featured player with play/pause, seek, and duration display
- **Previous Transcription Playback**: Load and play audio from any saved transcription
- **WebM Audio Format**: Efficient browser-native audio format with proper duration metadata

### Transcription Management
- **Save/Load Transcriptions**: PostgreSQL storage with full CRUD operations
- **Transcription Selector**: Dropdown to quickly load previous transcriptions
- **Unsaved Changes Warning**: Confirmation dialog prevents accidental data loss
- **Modification Tracking**: Track edit history and modification counts

### AI-Powered Review
- **Grammar Correction**: Fix spelling and grammar errors via Ollama
- **Rephrasing**: Rewrite text in a more professional tone
- **Summarization**: Create concise summaries of transcriptions
- **Text Improvement**: Overall enhancement (grammar + clarity + flow)
- **Model Selection**: Choose from available Ollama models (thinking models auto-filtered)
- **Settings Persistence**: Language and model preferences saved across sessions

### Editor
- **TipTap Rich Text Editor**: Markdown editing with live preview
- **Auto-scroll**: Editor automatically follows new transcription text during recording
- **Keyboard Shortcuts**: Standard editing shortcuts supported

### Integration
- **Obsidian Integration**: Direct database access for importing transcriptions
- **Secure Access**: HTTPS via Tailscale with automatic certificate management
- **REST API**: Full API for programmatic access

## Architecture

The frontend dynamically connects to the backend based on the browser's hostname. This allows the same frontend to work with different backend machines.

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (Tailscale Network)                                     │
│ - Audio Recording (MediaRecorder API)                           │
│ - Live Waveform Visualization                                   │
│ - Dynamic Backend Detection (uses window.location.hostname)     │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ HTTPS/WSS (port 443)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Tailscale Serve (TLS Termination)                               │
│ - Provides HTTPS on port 443                                    │
│ - Proxies to localhost:8000                                     │
│ - Automatic certificate management                              │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ HTTP (localhost:8000)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Whisper Backend (FastAPI + Uvicorn)                             │
│                                                                 │
│  Option A: MLX-Whisper (Mac)      Option B: CUDA-Whisper (Win)  │
│  ┌─────────────────────────┐     ┌─────────────────────────┐    │
│  │ Apple Silicon (M1-M4)   │     │ NVIDIA GPU (RTX 4090)   │    │
│  │ ~/projects/python/      │     │ ~/projects/python/      │    │
│  │   mlx_whisper/          │     │   cuda_whisper/         │    │
│  └─────────────────────────┘     └─────────────────────────┘    │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┴────────┬─────────────┐
    ▼                 ▼             ▼
┌─────────┐    ┌──────────┐  ┌──────────┐
│Postgres │    │  Ollama  │  │  Audio   │
│ [Docker]│    │  (Host)  │  │  Files   │
│  :5432  │    │  :11434  │  │  (Host)  │
└────┬────┘    └──────────┘  └──────────┘
     │
     ▼
┌─────────┐
│ Obsidian│
└─────────┘
```

### Backend Options

| Backend | Hardware | Location | Tailscale Hostname |
|---------|----------|----------|-------------------|
| MLX-Whisper | Apple Silicon Mac | `~/projects/python/mlx_whisper/` | `jacques-m4-macbook-pro-max.tail60cd1d.ts.net` |
| CUDA-Whisper | NVIDIA RTX 4090 | `~/projects/python/cuda_whisper/` | `14900k-rtx4090.tail60cd1d.ts.net` |

### How Dynamic Backend Detection Works

The frontend supports two modes of operation:

**Mode 1: Direct Backend Access**
Access the backend machine's hostname directly:
- `https://jacques-m4-macbook-pro-max.tail60cd1d.ts.net/` → Uses Mac MLX backend
- `https://14900k-rtx4090.tail60cd1d.ts.net/` → Uses Windows CUDA backend

**Mode 2: Centralized Frontend with Backend Query Parameter**
Access the Docker-hosted frontend and specify which backend to use:
- `https://whisper.tail60cd1d.ts.net/?backend=jacques-m4-macbook-pro-max` → Mac MLX backend
- `https://whisper.tail60cd1d.ts.net/?backend=14900k-rtx4090` → Windows CUDA backend

The short hostname (without `.tail60cd1d.ts.net`) is automatically expanded.

**How it works:**
1. Frontend checks for `?backend=` query parameter
2. If present, uses that hostname; otherwise uses `window.location.hostname`
3. API calls go to `https://${backend}/api/...`
4. WebSocket connects to `wss://${backend}/ws/transcribe`
5. Audio files are fetched from the backend machine
6. Tailscale Serve on the backend provides TLS and proxies to port 8000

## Prerequisites

### For MLX Backend (Mac)
1. **Apple Silicon Mac** (M1 or later) for MLX acceleration
   - The backend uses MLX-Whisper for GPU-accelerated transcription

### For CUDA Backend (Windows)
1. **NVIDIA GPU** (RTX 3090/4090 recommended) with CUDA support
   - The backend uses faster-whisper with CUDA acceleration
   - Requires CUDA toolkit and cuDNN installed

### Common Requirements
2. **Ollama** installed and running on host machine
   - Install: https://ollama.ai
   - Default port: 11434
   - Pull a model: `ollama pull llama3.2`

3. **Tailscale** configured for the n8n-compose stack
   - See main README.md for Tailscale setup

4. **Docker and Docker Compose** for frontend and database

5. **Python 3.11+** with venv for the MLX backend

## Quick Start

### 1. Configure Environment Variables

Edit `.env` file in the n8n-compose directory:

```bash
# Set a secure database password
WHISPER_DB_PASSWORD=your_secure_password_here
```

### 2. Start Docker Services (Database & Frontend)

```bash
# From the n8n-compose directory
docker-compose up -d whisper-db whisper-frontend
```

### 3. Start the MLX-Whisper Backend (on Host)

```bash
# Kill any existing backend process
pkill -f "uvicorn app.main:app.*8000"

# Start the backend with proper environment
cd ~/projects/python/mlx_whisper && source venv/bin/activate && \
  WHISPER_DB_PASSWORD="$WHISPER_DB_PASSWORD" \
  DATABASE_URL="postgresql+asyncpg://whisper:${WHISPER_DB_PASSWORD}@localhost:5432/whisper" \
  nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/whisper_backend.log 2>&1 &
```

### 4. Access the Web UI

Open in your browser (from any device on your Tailscale network):
```
https://whisper.tail60cd1d.ts.net
```

## Usage

### Recording and Transcribing

1. **Select a Whisper model** from the dropdown (tiny, base, small, medium, large-v3, turbo)
2. **Select audio channel** if recording stereo (left, right, or both)
3. **Configure settings** via the gear icon in the AI toolbar (language, Ollama model)
4. **Click "Start Recording"** - grant microphone permissions when prompted
5. **Watch the live waveform** visualization as you speak
6. **Transcription appears in real-time** in the editor (~6-9 second segments)
7. **Click "Stop Recording"** when done - final audio chunk is transcribed
8. **Restart recording** to continue adding to the same transcription

### Audio Playback

- **After recording**: Audio player appears with your recorded audio
- **Play/Pause**: Click the play button to listen back
- **Seek**: Click anywhere on the progress bar to jump to that position
- **Duration display**: Shows current time and total duration

### Loading Previous Transcriptions

1. **Use the dropdown** at the top to select a saved transcription
2. **Warning dialog** appears if you have unsaved changes
3. **Audio switches** to the selected transcription's recording
4. **Play back** the original audio while viewing/editing the text

### Editing Transcriptions

- **Edit Text**: Click in the editor and type/modify as needed
- **Auto-scroll**: Editor follows new text during recording (can be toggled)
- **Preview**: Click "Preview" button to see formatted markdown

### AI Review Features

Use the AI toolbar buttons to:
- **Fix Grammar**: Correct spelling and grammar errors
- **Rephrase**: Rewrite in a more professional tone
- **Improve**: Overall text enhancement (grammar + clarity + flow)

The current language and Ollama model are displayed inline after the AI action buttons. Click the gear icon to change settings.

**Settings (accessible via gear icon):**
- **Transcription Language**: Choose from 50+ languages or auto-detect
- **Ollama Model**: Select from available models (thinking/reasoning models are filtered out for faster processing)

All settings persist across browser sessions via localStorage.

### Saving Transcriptions

1. Enter a title in the title field
2. Click "Save to Database"
3. Transcription and audio file path are stored in PostgreSQL
4. **Audio concatenation**: If you save, then record more, the new audio is appended

## Obsidian Integration

### Database Connection

Connect Obsidian to the PostgreSQL database to import transcriptions:

**Connection Details:**
- Host: `localhost` (or your Mac's IP if accessing from another device)
- Port: `5432`
- Database: `whisper`
- User: `whisper`
- Password: (value from `WHISPER_DB_PASSWORD` in `.env`)

### Recommended Obsidian Plugins

1. **Database Folder** - Import transcriptions as markdown notes
2. **Dataview** - Query and display transcriptions
3. **DB Query** - Run custom SQL queries

### Example Query

```sql
SELECT
    id,
    title,
    content_md,
    created_at,
    speaker_map
FROM transcriptions
ORDER BY created_at DESC
LIMIT 10;
```

## Configuration

### MLX-Whisper Model Selection

Models can be selected at runtime via the web UI dropdown. Available models:

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `mlx-community/whisper-tiny` | 75 MB | Fastest | Good for quick notes |
| `mlx-community/whisper-base-mlx` | 145 MB | Fast | Good balance |
| `mlx-community/whisper-small-mlx` | 483 MB | Medium | Better accuracy |
| `mlx-community/whisper-medium-mlx` | 1.5 GB | Slower | High accuracy |
| `mlx-community/whisper-large-v3-mlx` | 3 GB | Slowest | Highest accuracy |
| `mlx-community/whisper-large-v3-turbo` | 809 MB | Fast | **Recommended** (best speed/accuracy) |

Models are downloaded automatically from HuggingFace on first use.

### Stereo Channel Selection

For stereo recordings (e.g., from audio interfaces), select which channel to transcribe:
- **Both**: Mix left and right channels to mono (default)
- **Left**: Transcribe only left channel
- **Right**: Transcribe only right channel

### Ollama Model Selection

Ollama models can be selected via the Settings dialog in the web UI (click the gear icon in the AI toolbar).

**Features:**
- Models are loaded dynamically from your local Ollama instance
- **Thinking/reasoning models are automatically filtered out** (qwen3, deepseek-r1, qwq, o1) as they are too slow for quick text review
- Selected model is persisted in localStorage across sessions

**Default fallback:** `llama3.2` if no model is selected

Available models: https://ollama.ai/library

### Performance Tuning

#### Apple Silicon (MLX)
- Uses Metal Performance Shaders via MLX framework
- 5-10x faster than CPU-only transcription
- Use `tiny` or `base` model for best real-time performance

#### Transcription Window Settings
Edit `~/projects/python/mlx_whisper/app/routers/websocket.py`:
```python
self.chunk_duration_threshold = 6.0  # Seconds between transcriptions
self.window_seconds = 9.0            # Audio window size for each transcription
```

Lower values = more frequent updates (but more processing overhead)

## API Documentation

### REST API Endpoints

- `GET /api/transcriptions` - List all transcriptions (with pagination)
- `GET /api/transcriptions/{id}` - Get specific transcription
- `POST /api/transcriptions` - Create new transcription
- `PATCH /api/transcriptions/{id}` - Update transcription
- `DELETE /api/transcriptions/{id}` - Delete transcription
- `POST /api/transcriptions/transcribe` - Upload audio file for transcription
- `POST /api/transcriptions/ai-review` - AI text review
- `GET /api/transcriptions/ollama-models` - List available Ollama models (thinking models filtered)

### WebSocket Endpoint

- `wss://{tailscale-hostname}/ws/transcribe` - Real-time transcription (HTTPS via Tailscale Serve)

**Client Messages:**
```json
// Send audio chunk
{
  "type": "audio_chunk",
  "data": "<base64_audio>",
  "duration": 3.0
}

// End recording
{
  "type": "end_recording"
}
```

**Server Messages:**
```json
// Transcription result
{
  "type": "transcription",
  "segments": [
    {
      "speaker": "SPEAKER_00",
      "text": "Hello world",
      "start": 0.0,
      "end": 1.5
    }
  ]
}

// Status update
{
  "type": "status",
  "message": "Transcribing..."
}
```

## Troubleshooting

### "Ollama not available" Error

1. Check Ollama is running: `ollama list`
2. Verify connection: `curl http://localhost:11434/api/tags`
3. Check Docker can reach host: `docker exec whisper-backend curl http://host.docker.internal:11434/api/tags`

### WhisperX Model Not Loading

1. Check HuggingFace cache: `ls ~/.cache/huggingface`
2. Manually download: `python -c "import whisperx; whisperx.load_model('base', 'mps')"`
3. Check Docker volume mount in `docker-compose.yml`

### Speaker Diarization Not Working

1. Ensure `HF_TOKEN` is set in `.env`
2. Verify token has read permissions
3. Check backend logs: `docker-compose logs whisper-backend`

### Audio Recording Not Starting

1. Grant microphone permissions in browser
2. Use HTTPS (required for Web Audio API)
3. Check browser console for errors
4. Verify WebSocket connection

### Database Connection Issues

1. Check PostgreSQL is running: `docker-compose ps whisper-db`
2. Test connection: `docker exec whisper-db psql -U whisper -d whisper -c "SELECT COUNT(*) FROM transcriptions;"`
3. Verify password in `.env`

## Development

### Backend Development (MLX-Whisper)

```bash
cd ~/projects/python/mlx_whisper

# Create virtual environment (if not exists)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run locally
export WHISPER_DB_PASSWORD=your_password
export DATABASE_URL=postgresql+asyncpg://whisper:${WHISPER_DB_PASSWORD}@localhost:5432/whisper
export OLLAMA_BASE_URL=http://localhost:11434
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# View logs
tail -f /tmp/whisper_backend.log
```

### Frontend Development

```bash
cd whisper-project/whisper-frontend

# Install dependencies
npm install

# Run dev server (for local development)
npm run dev

# Build and deploy to Docker
docker-compose build --no-cache whisper-frontend && docker-compose up -d whisper-frontend
```

**Important**: Always use `--no-cache` when rebuilding the frontend to ensure code changes are included.

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
    metadata JSONB DEFAULT '{}',
    is_reviewed BOOLEAN DEFAULT FALSE
);
```

## Credits

- **MLX-Whisper**: https://github.com/ml-explore/mlx-examples/tree/main/whisper
- **MLX**: https://github.com/ml-explore/mlx (Apple's ML framework for Apple Silicon)
- **Ollama**: https://ollama.ai
- **TipTap**: https://tiptap.dev
- **FastAPI**: https://fastapi.tiangolo.com
- **Tailscale**: https://tailscale.com
- **React**: https://react.dev

## License

This project is part of the n8n-compose stack and follows the same licensing.
