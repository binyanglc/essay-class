-- ============================================
-- Migration v19: "hints only" students also see why
--
-- In a "hints only" assignment the student now sees, for each problem, the
-- explanation (shown as "Hint") as well as the usage & examples — never the
-- corrected sentence itself. Corrections written from now on are marked
-- "whyShared", and only their explanations are handed to the student:
-- explanations written before this change were meant for the teacher only,
-- so they stay hidden.
--
-- This only replaces the function feedback_hints() (v16) with one that also
-- returns "why". No table or data changes. Run in the Supabase SQL Editor,
-- in a NEW query tab containing only this file — before or after pushing the
-- new code, either order works (until both are done students just don't see
-- the explanation). Safe to run again.
-- ============================================

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
          -- The explanation only when it was written (and checked) for the student
          'why', CASE WHEN r->'whyShared' = 'true'::jsonb THEN r->'explanation' END,
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

REVOKE ALL ON FUNCTION public.feedback_hints(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_hints(uuid) TO anon, authenticated;
