-- ============================================
-- Migration v13: keep the AI's original feedback
--
-- When a teacher edits AI feedback, the corrections and comments are
-- overwritten, so what the AI first wrote was lost. This keeps a copy of the
-- AI's feedback exactly as it was first shown (comments + corrections, with
-- the corrections' ids), plus the model and correction level. Comparing it
-- with the current feedback shows which AI corrections the teacher kept,
-- changed or removed, and which they added.
--
-- The copy is for research: nobody can read, change or delete it from the
-- site (students and teachers see only the current feedback). Only the site
-- owner sees it, in the Supabase dashboard. It goes only when its feedback
-- is deleted.
--
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this
-- file. Safe to run again (an earlier version of this file let class
-- teachers read the copy; running this one takes that away). If it stops
-- with "lock timeout", nothing was changed (the site was saving an essay at
-- that moment): just run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- The new table refers to submissions and feedback: lock them first, in
  -- this order, so this can't wait in a circle with the site's queries
  LOCK TABLE public.submissions, public.feedback IN SHARE ROW EXCLUSIVE MODE;

  CREATE TABLE IF NOT EXISTS public.feedback_ai_originals (
    feedback_id uuid PRIMARY KEY REFERENCES public.feedback(id) ON DELETE CASCADE,
    submission_id uuid NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    model text,
    correction_level text,
    -- overall_comment, characters_comment, vocabulary_comment, grammar_comment,
    -- content_feedback, structure_feedback, sentence_revisions
    content jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_ai_originals_submission
    ON public.feedback_ai_originals(submission_id);

  ALTER TABLE public.feedback_ai_originals ENABLE ROW LEVEL SECURITY;
  -- Logged-in users (guests too) may save it, as far as the policy below allows
  GRANT INSERT ON public.feedback_ai_originals TO authenticated;

  -- Saved by the student's own submission request, for that essay's feedback
  DROP POLICY IF EXISTS "Students save the AI original of own feedback" ON public.feedback_ai_originals;
  CREATE POLICY "Students save the AI original of own feedback" ON public.feedback_ai_originals
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.feedback f
        JOIN public.submissions s ON s.id = f.submission_id
        WHERE f.id = feedback_ai_originals.feedback_id
          AND s.id = feedback_ai_originals.submission_id
          AND s.student_id = auth.uid()
      )
    );

  -- No select, update or delete policies: nobody can read, change or delete it
  -- from the site. (Removes the teacher read access of the first version.)
  DROP POLICY IF EXISTS "Teachers read AI originals of their class feedback" ON public.feedback_ai_originals;
END
$$;
