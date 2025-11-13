# WhisperX Transcription System

A comprehensive real-time audio transcription system using WhisperX, with speaker diarization, AI-powered text review via Ollama, and Obsidian integration.

## Features

- **Real-time Transcription**: Browser-based audio recording with WebSocket streaming to WhisperX
- **Speaker Diarization**: Automatic speaker identification and labeling
- **AI Review**: Ollama-powered grammar correction, rephrasing, summarization, and text improvement
- **Rich Text Editor**: TipTap-based markdown editor with live preview
- **Database Storage**: PostgreSQL storage for all transcriptions
- **Obsidian Integration**: Direct database access for importing transcriptions into Obsidian
- **Secure Access**: HTTPS via Tailscale with automatic certificate management
- **Apple Silicon Optimized**: MPS (Metal Performance Shaders) acceleration for fast transcription

## Architecture

```
┌─────────────────────────────────────────┐
│ Browser (Tailscale Network)             │
│ https://whisper.tail60cd1d.ts.net       │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│ Traefik (Reverse Proxy)                 │
│ - TLS termination                       │
│ - Routing to frontend                   │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐    ┌─────────────┐
│ Frontend│    │   Backend   │
│ React   │◄──►│   FastAPI   │
│ TipTap  │WS  │   WhisperX  │
└─────────┘REST└──────┬──────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    ┌────────┐  ┌─────────┐  ┌─────────┐
    │Postgres│  │ Ollama  │  │Audio    │
    │  :5432 │  │ (Host)  │  │ Files   │
    └───┬────┘  └─────────┘  └─────────┘
        │
        ▼
    ┌────────┐
    │Obsidian│
    └────────┘
```

## Prerequisites

1. **Ollama** installed and running on host machine
   - Install: https://ollama.ai
   - Default port: 11434
   - Pull a model: `ollama pull llama3.2`

2. **Tailscale** configured for the n8n-compose stack
   - See main README.md for Tailscale setup

3. **HuggingFace Token** (optional, for speaker diarization)
   - Create account at https://huggingface.co
   - Generate token at https://huggingface.co/settings/tokens
   - Add to `.env` as `HF_TOKEN`

4. **Docker and Docker Compose**

## Quick Start

### 1. Configure Environment Variables

Edit `.env` file in the project root:

```bash
# Set a secure database password
WHISPER_DB_PASSWORD=your_secure_password_here

# Optional: Add HuggingFace token for speaker diarization
HF_TOKEN=hf_your_token_here
```

### 2. Start Services

```bash
# From the n8n-compose directory
docker-compose up -d whisper-db whisper-backend whisper-frontend
```

### 3. Access the Web UI

Open in your browser (from any device on your Tailscale network):
```
https://whisper.tail60cd1d.ts.net
```

## Usage

### Recording and Transcribing

1. **Click "Start Recording"** in the web interface
2. Grant microphone permissions when prompted
3. Speak into your microphone
4. Transcription appears in real-time in the editor (5-10 second delay)
5. **Click "Stop Recording"** when done

### Editing Transcriptions

- **Edit Text**: Click in the editor and type/modify as needed
- **Preview**: Click "Preview" button to see formatted markdown
- **Speaker Labels**: Edit speaker names (SPEAKER_00 → John, etc.)

### AI Review Features

Use the AI toolbar buttons to:
- **Fix Grammar**: Correct spelling and grammar errors
- **Rephrase**: Rewrite in a more professional tone
- **Summarize**: Create a concise summary
- **Improve**: Overall text enhancement (grammar + clarity + flow)

All AI features use your local Ollama instance.

### Saving Transcriptions

1. Enter a title in the title field
2. Click "Save to Database"
3. Transcription is stored in PostgreSQL

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

### WhisperX Model Selection

Edit `.env` to choose a different model:

```bash
# Options: tiny, base, small, medium, large-v2
WHISPER_MODEL=base
```

**Model Recommendations:**
- `tiny`: Fastest, lowest accuracy
- `base`: **Recommended** - Good balance
- `small`: Better accuracy, still reasonably fast
- `medium`: High accuracy, slower
- `large-v2`: Best accuracy, slowest

### Ollama Model

The default Ollama model is `llama3.2`. To change:

Edit `whisper-backend/app/ollama_client.py`:
```python
default_model: str = "llama3.2",  # Change to your preferred model
```

Available models: https://ollama.ai/library

### Performance Tuning

#### Apple Silicon (MPS)
- Already optimized by default
- 3-5x faster than CPU
- Use `base` or `small` model for best real-time performance

#### Transcription Chunk Size
Edit `whisper-backend/app/routers/websocket.py`:
```python
self.chunk_duration_threshold = 5.0  # Seconds (default: 5)
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

### WebSocket Endpoint

- `ws://whisper.tail60cd1d.ts.net/ws/transcribe` - Real-time transcription

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

### Backend Development

```bash
cd whisper-project/whisper-backend

# Install dependencies
pip install -r requirements.txt

# Run locally
export DATABASE_URL=postgresql+asyncpg://whisper:password@localhost:5432/whisper
export OLLAMA_BASE_URL=http://localhost:11434
python -m uvicorn app.main:app --reload
```

### Frontend Development

```bash
cd whisper-project/whisper-frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

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

- **WhisperX**: https://github.com/m-bain/whisperx
- **Ollama**: https://ollama.ai
- **TipTap**: https://tiptap.dev
- **FastAPI**: https://fastapi.tiangolo.com
- **Tailscale**: https://tailscale.com

## License

This project is part of the n8n-compose stack and follows the same licensing.
