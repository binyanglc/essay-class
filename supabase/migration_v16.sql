-- ============================================
-- Migration v16: "hints only" feedback
--
-- Each assignment can choose what students get:
--   corrections - the corrected sentences and why (as before, the default)
--   hints       - where each problem is, what kind it is and a short hint,
--                 never the corrected sentence; the student fixes it
--
-- The AI still writes full corrections and the teacher sees everything. For
-- "hints" feedback the student can no longer read the feedback row or its
-- labels directly (they contain the answers). Instead feedback_hints() hands
-- them only the safe parts: their own words, where the problems are, the
-- label categories, rules and grammar points, the hints and the comments.
--
-- Nothing that already exists changes: all existing feedback stays
-- "corrections". Run in the Supabase SQL Editor, in a NEW query tab
-- containing only this file, BEFORE pushing the new code (after v14 and v15).
-- Safe to run again. If it stops with "lock timeout" or "deadlock detected",
-- nothing was changed (the site was saving something at that moment): just
-- run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- A row being saved locks its own table, then the tables it points to
  -- (labels and comments → feedback → submissions → projects). Locking in the
  -- same order means this can't wait in a circle with the site.
  LOCK TABLE public.error_tags, public.feedback_comments, public.feedback,
    public.submissions, public.projects IN ACCESS EXCLUSIVE MODE;

  -- 1) The setting, per assignment, and on each feedback (fixed when it is written)
  ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS feedback_style text NOT NULL DEFAULT 'corrections';
  ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_feedback_style_check;
  ALTER TABLE public.projects ADD CONSTRAINT projects_feedback_style_check
    CHECK (feedback_style IN ('corrections', 'hints'));

  -- Empty = corrections (all feedback from before this migration)
  ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS feedback_style text;
  ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_feedback_style_check;
  ALTER TABLE public.feedback ADD CONSTRAINT feedback_feedback_style_check
    CHECK (feedback_style IS NULL OR feedback_style IN ('corrections', 'hints'));

  -- 2) The caller's own compositions with "hints" feedback (used by the label rules below)
  CREATE OR REPLACE FUNCTION public.my_hint_submissions()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT f.submission_id
    FROM public.feedback f
    JOIN public.submissions s ON s.id = f.submission_id
    WHERE f.feedback_style = 'hints'
      AND s.student_id = auth.uid()
  $fn$;

  -- 3) "Hints" feedback without the answers: for the student once it is
  --    released, and for the class teacher (to preview what the student sees).
  --    Leaves out the corrected sentences, explanations, the words in labels
  --    ("结束 ← 完"), label names typed by the teacher, study tips and the AI's
  --    original labels. Empty (null) for anyone else, or for "corrections".
  CREATE OR REPLACE FUNCTION public.feedback_hints(p_submission_id uuid)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT jsonb_build_object(
      'feedback', jsonb_build_object(
        'id', f.id,
        'submission_id', f.submission_id,
        'overall_comment', f.overall_comment,
        'characters_comment', f.characters_comment,
        'vocabulary_comment', f.vocabulary_comment,
        'grammar_comment', f.grammar_comment,
        'content_feedback', f.content_feedback,
        'structure_feedback', f.structure_feedback,
        'teacher_edited_at', f.teacher_edited_at,
        'correction_level', f.correction_level,
        'released_at', f.released_at,
        'teacher_viewed_at', f.teacher_viewed_at,
        'feedback_style', f.feedback_style,
        'created_at', f.created_at,
        'hints', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', r->'id',
            -- Only words found in the composition (an unmatched AI quote might be partly corrected)
            'original', CASE WHEN jsonb_typeof(r->'start') = 'number' THEN r->'original' END,
            'start', r->'start',
            'end', r->'end',
            'source', r->'source',
            'commentKey', r->'commentKey',
            'hint', r->'hint',
            'marks', r->'marks'
          ) ORDER BY e.ord)
          FROM jsonb_array_elements(COALESCE(f.sentence_revisions, '[]'::jsonb)) WITH ORDINALITY AS e(r, ord)
        ), '[]'::jsonb)
      ),
      'tags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', t.id,
          'submission_id', t.submission_id,
          'student_id', t.student_id,
          'error_type', t.error_type,
          'code', t.code,
          'rule', t.rule,
          'grammar_point', t.grammar_point,
          'nature', t.nature,
          'severity', t.severity,
          'operation', t.operation,
          'source', t.source,
          'status', t.status,
          'revision_id', t.revision_id,
          -- the student's words only when they are in the composition
          'original_text', CASE WHEN strpos(s.final_text, t.original_text) > 0 THEN t.original_text END,
          'created_at', t.created_at
        ) ORDER BY t.created_at)
        FROM public.error_tags t
        WHERE t.submission_id = f.submission_id
          AND t.status IS DISTINCT FROM 'deleted'
      ), '[]'::jsonb)
    )
    FROM public.feedback f
    JOIN public.submissions s ON s.id = f.submission_id
    WHERE f.submission_id = p_submission_id
      AND f.feedback_style = 'hints'
      AND (
        (s.student_id = auth.uid() AND f.released_at IS NOT NULL)
        OR EXISTS (
          SELECT 1 FROM public.classes c
          WHERE c.id = s.class_id AND c.teacher_id = auth.uid()
        )
      )
  $fn$;

  -- 4) The caller's labels from released "hints" feedback, without the answers
  --    (for "My Error Patterns")
  CREATE OR REPLACE FUNCTION public.my_hint_tags()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'submission_id', t.submission_id,
      'student_id', t.student_id,
      'error_type', t.error_type,
      'code', t.code,
      'rule', t.rule,
      'grammar_point', t.grammar_point,
      'nature', t.nature,
      'severity', t.severity,
      'operation', t.operation,
      'source', t.source,
      'status', t.status,
      'revision_id', t.revision_id,
      -- the student's words only when they are in the composition
      'original_text', CASE WHEN strpos(s.final_text, t.original_text) > 0 THEN t.original_text END,
      'created_at', t.created_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    FROM public.error_tags t
    JOIN public.feedback f ON f.submission_id = t.submission_id
    JOIN public.submissions s ON s.id = t.submission_id
    WHERE s.student_id = auth.uid()
      AND t.student_id = auth.uid()
      AND f.feedback_style = 'hints'
      AND f.released_at IS NOT NULL
      AND t.status IS DISTINCT FROM 'deleted'
  $fn$;

  -- 5) Who can read and write comments on a feedback: its student once it is
  --    released (either style), and the class teacher
  CREATE OR REPLACE FUNCTION public.can_discuss_feedback(p_feedback_id uuid)
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
        AND (
          (s.student_id = auth.uid() AND f.released_at IS NOT NULL)
          OR EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = s.class_id AND c.teacher_id = auth.uid()
          )
        )
    )
  $fn$;

  REVOKE ALL ON FUNCTION public.my_hint_submissions() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.feedback_hints(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.my_hint_tags() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.can_discuss_feedback(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.my_hint_submissions() TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.feedback_hints(uuid) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.my_hint_tags() TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.can_discuss_feedback(uuid) TO anon, authenticated;

  -- 6) Students read their feedback once released, and only "corrections"
  --    feedback directly (v14 plus the style); the class teacher always
  DROP POLICY IF EXISTS "Users can read relevant feedback" ON public.feedback;
  CREATE POLICY "Users can read relevant feedback" ON public.feedback
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = feedback.submission_id
          AND (
            (
              s.student_id = auth.uid()
              AND feedback.released_at IS NOT NULL
              AND feedback.feedback_style IS DISTINCT FROM 'hints'
            )
            OR EXISTS (
              SELECT 1 FROM public.classes c
              WHERE c.id = s.class_id AND c.teacher_id = auth.uid()
            )
          )
      )
    );

  -- 7) The same for labels (v14 rules, plus: not for "hints" feedback)
  DROP POLICY IF EXISTS "Users can read relevant error tags" ON public.error_tags;
  CREATE POLICY "Users can read relevant error tags" ON public.error_tags
    FOR SELECT USING (
      (
        auth.uid() = student_id
        AND status IS DISTINCT FROM 'deleted'
        AND submission_id NOT IN (SELECT public.my_submissions_in_review())
        AND submission_id NOT IN (SELECT public.my_hint_submissions())
      )
      OR EXISTS (
        SELECT 1 FROM public.submissions s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = error_tags.submission_id
          AND c.teacher_id = auth.uid()
      )
    );

  -- 8) Comments (v8) used to check through the feedback row, which "hints"
  --    students can't read any more: check with can_discuss_feedback instead
  DROP POLICY IF EXISTS "Users can read relevant comments" ON public.feedback_comments;
  CREATE POLICY "Users can read relevant comments" ON public.feedback_comments
    FOR SELECT USING (public.can_discuss_feedback(feedback_id));

  DROP POLICY IF EXISTS "Users can insert comments" ON public.feedback_comments;
  CREATE POLICY "Users can insert comments" ON public.feedback_comments
    FOR INSERT WITH CHECK (
      auth.uid() = user_id
      AND public.can_discuss_feedback(feedback_id)
    );
END
$$;
