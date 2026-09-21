-- ============================================
-- Migration v9: photo paths, AI correction level
-- Run in the Supabase SQL Editor BEFORE deploying the new code.
-- Only adds columns — the current site keeps working.
-- ============================================

-- 1) Store the storage path of the uploaded photo (the bucket becomes private in v10,
--    so photos are shown through short-lived signed URLs instead of public URLs).
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS image_path text;
CREATE INDEX IF NOT EXISTS idx_submissions_image_path ON submissions(image_path) WHERE image_path IS NOT NULL;

-- Backfill image_path for existing photos from their public URL
-- (…/storage/v1/object/public/compositions/<url-encoded path>).
CREATE OR REPLACE FUNCTION pg_temp.url_decode(input text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  result bytea := ''::bytea;
  i int := 1;
  n int := length(input);
  ch text;
BEGIN
  WHILE i <= n LOOP
    ch := substr(input, i, 1);
    IF ch = '%' AND i + 2 <= n AND substr(input, i + 1, 2) ~ '^[0-9A-Fa-f]{2}$' THEN
      result := result || decode(substr(input, i + 1, 2), 'hex');
      i := i + 3;
    ELSE
      result := result || convert_to(ch, 'UTF8');
      i := i + 1;
    END IF;
  END LOOP;
  RETURN convert_from(result, 'UTF8');
END;
$$;

UPDATE submissions
SET image_path = pg_temp.url_decode(
  split_part(substring(image_url FROM '/object/public/compositions/(.*)$'), '?', 1)
)
WHERE image_path IS NULL
  AND image_url LIKE '%/object/public/compositions/%';

-- 2) How strictly the AI corrects, set per project by the teacher.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS correction_level text NOT NULL DEFAULT 'standard';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_correction_level_check;
ALTER TABLE projects ADD CONSTRAINT projects_correction_level_check
  CHECK (correction_level IN ('essential', 'standard', 'detailed'));

-- The level each piece of feedback was generated with (NULL = older feedback,
-- which only corrected a few key sentences).
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS correction_level text;

-- Check: every photo should now have a path (expect 0 rows)
-- SELECT id, image_url FROM submissions WHERE image_url IS NOT NULL AND image_path IS NULL;
