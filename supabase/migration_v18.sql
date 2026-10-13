-- ============================================
-- Migration v18: the students' level, per assignment
--
-- Each assignment can say what level its students are at, so the AI
-- corrects with words and grammar at that level or below, instead of
-- "upgrading" a basic composition with advanced words:
--   beginner / intermediate / advanced - the kind of course (about HSK 1–2,
--                 3–4 and 5–6), for teachers who don't know the HSK level
--   1 … 6, 7-9  - an exact level of the 2025 HSK syllabus
-- Empty = not set: the AI judges the level from the composition (as before).
--
-- Each feedback (and its research copy, v13) also records the level the AI
-- was told, since the assignment's setting can change later.
--
-- Nothing that already exists changes: every assignment starts "not set".
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this
-- file, BEFORE pushing the new code (after v17). Safe to run again (also if
-- an earlier version of this file, without beginner/intermediate/advanced,
-- was run). If it stops with "lock timeout" or "deadlock detected", nothing
-- was changed (the site was saving something at that moment): just run it
-- again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- A row being saved locks its own table, then the tables it points to
  -- (AI originals → feedback → submissions → projects): lock in the same order
  LOCK TABLE public.feedback_ai_originals, public.feedback, public.projects IN ACCESS EXCLUSIVE MODE;

  -- 1) The setting, per assignment
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS student_level text;
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_student_level_check;
  ALTER TABLE public.projects ADD CONSTRAINT projects_student_level_check
    CHECK (student_level IN ('beginner', 'intermediate', 'advanced', '1', '2', '3', '4', '5', '6', '7-9'));

  -- 2) The level each feedback was written for
  ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS student_level text;
  ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_student_level_check;
  ALTER TABLE public.feedback ADD CONSTRAINT feedback_student_level_check
    CHECK (student_level IN ('beginner', 'intermediate', 'advanced', '1', '2', '3', '4', '5', '6', '7-9'));

  ALTER TABLE public.feedback_ai_originals ADD COLUMN IF NOT EXISTS student_level text;
END
$$;
