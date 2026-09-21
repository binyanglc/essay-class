-- ============================================
-- Migration v11: teachers can add error labels
-- Lets a teacher add error labels (error_tags) to submissions in their own
-- classes — for errors the teacher found. Changing and deleting labels was
-- already allowed (v6, v7).
--
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this file.
-- Safe to run again. If it stops with "lock timeout", nothing was changed
-- (the site was using error_tags at that moment): just run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds for the table instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- Lock error_tags before anything else, so this can't end up waiting in a
  -- circle with the site's own queries (that is what "deadlock detected" was)
  LOCK TABLE public.error_tags IN ACCESS EXCLUSIVE MODE;

  DROP POLICY IF EXISTS "Teachers insert error tags for their class submissions" ON public.error_tags;
  CREATE POLICY "Teachers insert error tags for their class submissions" ON public.error_tags
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.submissions s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = error_tags.submission_id
          AND s.student_id = error_tags.student_id
          AND c.teacher_id = auth.uid()
      )
    );
END
$$;
