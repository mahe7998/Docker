-- Migration: Add diff tracking and soft delete functionality
-- Date: 2025-11-17
-- Description: Adds current_content_md, transcription_diffs table, and deleted_transcriptions table

-- 1. Add new columns to transcriptions table
ALTER TABLE transcriptions
ADD COLUMN IF NOT EXISTS current_content_md TEXT,
ADD COLUMN IF NOT EXISTS current_diff_id INTEGER,
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMP WITH TIME ZONE;

-- 2. Populate current_content_md with existing content_md for existing records
UPDATE transcriptions
SET current_content_md = content_md,
    last_modified_at = updated_at
WHERE current_content_md IS NULL;

-- 3. Make current_content_md NOT NULL after populating
ALTER TABLE transcriptions
ALTER COLUMN current_content_md SET NOT NULL;

-- 4. Create transcription_diffs table
CREATE TABLE IF NOT EXISTS transcription_diffs (
    id SERIAL PRIMARY KEY,
    transcription_id INTEGER NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
    diff_patch TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sequence_number INTEGER NOT NULL,
    summary TEXT,
    CONSTRAINT unique_transcription_sequence UNIQUE(transcription_id, sequence_number)
);

-- 5. Create indexes for transcription_diffs
CREATE INDEX IF NOT EXISTS idx_diffs_transcription_id ON transcription_diffs(transcription_id);
CREATE INDEX IF NOT EXISTS idx_diffs_sequence ON transcription_diffs(transcription_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_diffs_created_at ON transcription_diffs(created_at DESC);

-- 6. Add foreign key constraint for current_diff_id (after transcription_diffs table exists)
ALTER TABLE transcriptions
ADD CONSTRAINT fk_current_diff
FOREIGN KEY (current_diff_id)
REFERENCES transcription_diffs(id)
ON DELETE SET NULL;

-- 7. Create deleted_transcriptions table (mirror of transcriptions)
CREATE TABLE IF NOT EXISTS deleted_transcriptions (
    id INTEGER PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    title VARCHAR(255) NOT NULL,
    content_md TEXT NOT NULL,
    current_content_md TEXT NOT NULL,
    current_diff_id INTEGER,
    last_modified_at TIMESTAMP WITH TIME ZONE,
    audio_file_path VARCHAR(500),
    duration_seconds FLOAT,
    speaker_map JSONB DEFAULT '{}',
    extra_metadata JSONB DEFAULT '{}',
    is_reviewed BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_reason TEXT
);

-- 8. Create indexes for deleted_transcriptions
CREATE INDEX IF NOT EXISTS idx_deleted_transcriptions_deleted_at ON deleted_transcriptions(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_transcriptions_id ON deleted_transcriptions(id);

-- 9. Update the Obsidian view to include current_content_md
DROP VIEW IF EXISTS transcriptions_for_obsidian;
CREATE OR REPLACE VIEW transcriptions_for_obsidian AS
SELECT
    id,
    title,
    content_md as original_content,
    current_content_md as content,
    created_at,
    updated_at,
    last_modified_at,
    duration_seconds,
    speaker_map,
    is_reviewed,
    (SELECT COUNT(*) FROM transcription_diffs WHERE transcription_id = transcriptions.id) as modification_count
FROM transcriptions
ORDER BY COALESCE(last_modified_at, created_at) DESC;

-- 10. Create a view for diff history
CREATE OR REPLACE VIEW transcription_history AS
SELECT
    t.id as transcription_id,
    t.title,
    t.created_at as transcription_created_at,
    d.id as diff_id,
    d.sequence_number,
    d.created_at as modification_date,
    d.summary
FROM transcriptions t
LEFT JOIN transcription_diffs d ON t.id = d.transcription_id
ORDER BY t.id, d.sequence_number;

-- 11. Add comment documentation
COMMENT ON COLUMN transcriptions.content_md IS 'Original transcription content - never modified';
COMMENT ON COLUMN transcriptions.current_content_md IS 'Current content after applying all diffs - cached for performance';
COMMENT ON COLUMN transcriptions.current_diff_id IS 'Points to the latest diff in the chain';
COMMENT ON COLUMN transcriptions.last_modified_at IS 'Timestamp of last modification (when a diff was added)';
COMMENT ON TABLE transcription_diffs IS 'Stores incremental diffs for transcription modifications';
COMMENT ON TABLE deleted_transcriptions IS 'Soft-deleted transcriptions for recovery';
