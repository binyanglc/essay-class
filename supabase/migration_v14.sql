-- ============================================
-- Migration v14: "release after review" setting
--
-- Until now students saw the AI feedback as soon as they submitted. Each
-- assignment can now choose:
--   immediate    - students see the feedback right away (as before, the default)
--   after_review - the teacher checks the feedback first and releases it
--
-- Feedback that is not released yet is hidden from the student by the
-- database itself (not just by the website): the feedback, its labels and its
-- comments. The teacher sees everything as before, including Common Issues.
--
-- All feedback that already exists stays visible to students (it counts as
-- released when it was created). Assignments keep working as they do now
-- until the teacher picks "after review".
--
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this
-- file, BEFORE pushing the new code. Safe to run again (it never releases or
-- hides anything when run a second time). If it stops with "lock timeout",
-- nothing was changed (the site was saving an essay at that moment): just
-- run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- Lock the tables in the order the site uses them when a student submits,
  -- so this can't wait in a circle with the site's queries
  LOCK TABLE public.projects, public.submissions, public.feedback,
    public.feedback_ai_originals, public.error_tags IN ACCESS EXCLUSIVE MODE;

  -- 1) The setting, per assignment
  ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS feedback_release text NOT NULL DEFAULT 'immediate';
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_feedback_release_check;
  ALTER TABLE public.projects ADD CONSTRAINT projects_feedback_release_check
    CHECK (feedback_release IN ('immediate', 'after_review'));

  -- 2) When the student was allowed to see the feedback (empty = not yet).
  --    Only the first run fills it in for the feedback that already exists.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feedback' AND column_name = 'released_at'
  ) THEN
    ALTER TABLE public.feedback ADD COLUMN released_at timestamptz;
    UPDATE public.feedback SET released_at = COALESCE(created_at, now());
  END IF;
  -- Feedback saved without saying otherwise is released (so the site keeps
  -- working the old way until the new code is pushed)
  ALTER TABLE public.feedback ALTER COLUMN released_at SET DEFAULT now();

  -- 3) The student's own compositions whose feedback is waiting for the
  --    teacher. Used below, and by the student's pages to say "your teacher is
  --    reviewing it" instead of "no feedback". It can look at all feedback
  --    (security definer) but only ever answers about the caller's own work.
  CREATE OR REPLACE FUNCTION public.my_submissions_in_review()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT f.submission_id
    FROM public.feedback f
    JOIN public.submissions s ON s.id = f.submission_id
    WHERE f.released_at IS NULL
      AND s.student_id = auth.uid()
  $fn$;

  -- The submission request saves the AI's original copy (v13) right after the
  -- feedback, while the student can't see that feedback yet: check it here.
  CREATE OR REPLACE FUNCTION public.can_save_ai_original(p_feedback_id uuid, p_submission_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT EXISTS (
      SELECT 1
      FROM public.feedback f
      JOIN public.submissions s ON s.id = f.submission_id
      WHERE f.id = p_feedback_id
        AND s.id = p_submission_id
        AND s.student_id = auth.uid()
    )
  $fn$;

  REVOKE ALL ON FUNCTION public.my_submissions_in_review() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.can_save_ai_original(uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.my_submissions_in_review() TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.can_save_ai_original(uuid, uuid) TO anon, authenticated;

  -- 4) Students read their feedback only once it is released; the class
  --    teacher always. (Comments on feedback follow automatically: they are
  --    only readable through feedback the reader can see.)
  DROP POLICY IF EXISTS "Users can read relevant feedback" ON public.feedback;
  CREATE POLICY "Users can read relevant feedback" ON public.feedback
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = feedback.submission_id
          AND (
            (s.student_id = auth.uid() AND feedback.released_at IS NOT NULL)
            OR EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.id = s.class_id AND c.teacher_id = auth.uid()
            )
          )
      )
    );

  -- 5) The same for labels (v12 rules, plus: not while the feedback waits)
  DROP POLICY IF EXISTS "Users can read relevant error tags" ON public.error_tags;
  CREATE POLICY "Users can read relevant error tags" ON public.error_tags
    FOR SELECT USING (
      (
        auth.uid() = student_id
        AND status IS DISTINCT FROM 'deleted'
        AND submission_id NOT IN (SELECT public.my_submissions_in_review())
      )
      OR EXISTS (
        SELECT 1 FROM public.submissions s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = error_tags.submission_id
          AND c.teacher_id = auth.uid()
      )
    );

  -- 6) v13's rule for saving the AI original, now also while unreleased
  DROP POLICY IF EXISTS "Students save the AI original of own feedback" ON public.feedback_ai_originals;
  CREATE POLICY "Students save the AI original of own feedback" ON public.feedback_ai_originals
    FOR INSERT WITH CHECK (
      public.can_save_ai_original(feedback_id, submission_id)
    );
END
$$;
