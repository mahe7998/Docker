-- WhisperX Transcription Database Schema
-- Initialization script for PostgreSQL

-- Create transcriptions table
CREATE TABLE IF NOT EXISTS transcriptions (
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_updated_at ON transcriptions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_is_reviewed ON transcriptions(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_transcriptions_title ON transcriptions(title);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_transcriptions_updated_at
    BEFORE UPDATE ON transcriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for easy querying from Obsidian
CREATE OR REPLACE VIEW transcriptions_for_obsidian AS
SELECT
    id,
    title,
    content_md,
    created_at,
    updated_at,
    duration_seconds,
    speaker_map,
    is_reviewed
FROM transcriptions
ORDER BY created_at DESC;

-- Insert a sample transcription for testing
INSERT INTO transcriptions (title, content_md, duration_seconds, speaker_map, extra_metadata)
VALUES (
    'Sample Transcription',
    E'# Sample Transcription\n\nThis is a test transcription created during database initialization.\n\n**SPEAKER_00**: Hello, this is a test.\n\n**SPEAKER_01**: Yes, this is working correctly.',
    10.5,
    '{"SPEAKER_00": "User", "SPEAKER_01": "Assistant"}',
    '{"model": "whisper-base", "language": "en"}'
);
