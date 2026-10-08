-- ============================================
-- Migration v17: second (and third) drafts
--
-- After seeing the feedback, a student can revise the same composition and
-- submit it again: a new submission linked to the first draft, with its own
-- AI feedback (released like any other, see v14). Each assignment says how
-- many drafts a student may submit: 1 (no revising), 2 (the default) or 3.
--
-- Nothing that already exists changes: every existing submission is draft 1.
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this
-- file, BEFORE pushing the new code (after v16). Safe to run again. If it
-- stops with "lock timeout" or "deadlock detected", nothing was changed (the
-- site was saving something at that moment): just run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- A row being saved locks its own table, then the tables it points to
  -- (submissions → projects): lock in the same order
  LOCK TABLE public.submissions, public.projects IN ACCESS EXCLUSIVE MODE;

  -- 1) How many drafts a student may submit for one composition
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS max_drafts integer NOT NULL DEFAULT 2;
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_max_drafts_check;
  ALTER TABLE public.projects ADD CONSTRAINT projects_max_drafts_check CHECK (max_drafts BETWEEN 1 AND 3);

  -- 2) Which composition a draft belongs to (empty = it is the first draft) and its number
  ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS first_draft_id uuid REFERENCES public.submissions(id) ON DELETE CASCADE;
  ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS draft_number integer NOT NULL DEFAULT 1;
  ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_draft_number_check;
  ALTER TABLE public.submissions ADD CONSTRAINT submissions_draft_number_check CHECK (
    draft_number BETWEEN 1 AND 3
    AND (first_draft_id IS NULL) = (draft_number = 1)
  );
  -- One draft 2 (or 3) per composition
  CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_draft_unique
    ON public.submissions(first_draft_id, draft_number) WHERE first_draft_id IS NOT NULL;

  -- 3) A later draft must be the next draft of the caller's own composition,
  --    in the same class and assignment, within the assignment's number of
  --    drafts, after the student has had the feedback on the draft before.
  --    (A policy on submissions can't look at submissions itself, so this
  --    checks it with the owner's rights.)
  DROP POLICY IF EXISTS "Students can create submissions" ON public.submissions;
  DROP FUNCTION IF EXISTS public.can_add_draft(uuid, uuid, uuid);
  CREATE OR REPLACE FUNCTION public.can_add_draft(
    p_first_draft_id uuid, p_class_id uuid, p_project_id uuid, p_draft_number integer
  )
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT
      EXISTS (
        SELECT 1 FROM public.submissions d
        WHERE d.id = p_first_draft_id
          AND d.student_id = auth.uid()
          AND d.first_draft_id IS NULL
          AND d.class_id = p_class_id
          AND d.project_id IS NOT DISTINCT FROM p_project_id
      )
      -- the next number, and no more than the assignment allows
      AND p_draft_number = 1 + (
        SELECT max(x.draft_number) FROM public.submissions x
        WHERE x.id = p_first_draft_id OR x.first_draft_id = p_first_draft_id
      )
      AND p_draft_number <= COALESCE((SELECT p.max_drafts FROM public.projects p WHERE p.id = p_project_id), 2)
      -- the draft before has feedback the student can see
      AND EXISTS (
        SELECT 1 FROM public.feedback f
        JOIN public.submissions l ON l.id = f.submission_id
        WHERE (l.id = p_first_draft_id OR l.first_draft_id = p_first_draft_id)
          AND l.draft_number = p_draft_number - 1
          AND f.released_at IS NOT NULL
      )
  $fn$;
  REVOKE ALL ON FUNCTION public.can_add_draft(uuid, uuid, uuid, integer) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.can_add_draft(uuid, uuid, uuid, integer) TO anon, authenticated;

  --    A student submits only into their own folder (v10), and later drafts as above
  CREATE POLICY "Students can create submissions" ON public.submissions
    FOR INSERT WITH CHECK (
      auth.uid() = student_id
      AND (image_path IS NULL OR image_path LIKE auth.uid()::text || '/%')
      AND (first_draft_id IS NULL OR public.can_add_draft(first_draft_id, class_id, project_id, draft_number))
    );
END
$$;
