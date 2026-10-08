-- ============================================
-- Migration v15: "opened" and "kept on release" (after v14)
--
-- For assignments where the teacher checks the feedback before releasing it:
--   - feedback.teacher_viewed_at: when the class teacher first opened the
--     feedback (empty = not yet, also for all feedback from before this).
--     The project page offers "Release reviewed" (only those) next to
--     "Release all".
--   - a new label status "accepted": an AI label the teacher left as it was
--     in feedback they opened and then released. Students no longer see it
--     marked as an unchecked AI suggestion. For research it stays apart from
--     labels the teacher explicitly kept with ✓ / Keep all ("confirmed").
--     Feedback released without being opened keeps its AI labels as
--     suggestions.
--
-- Nothing that already exists changes. Run in the Supabase SQL Editor, in a
-- NEW query tab containing only this file, BEFORE pushing the new code. Safe
-- to run again. If it stops with "lock timeout", nothing was changed (the
-- site was saving an essay at that moment): just run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- Same order as the site uses them when a student submits
  LOCK TABLE public.feedback, public.error_tags IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS teacher_viewed_at timestamptz;

  -- v12's label statuses plus "accepted"
  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_status_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_status_check
    CHECK (status IS NULL OR status IN ('suggested', 'confirmed', 'accepted', 'modified', 'added', 'deleted'));
END
$$;
