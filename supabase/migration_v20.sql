-- ============================================
-- Migration v20: "My Error Patterns" can mark the student's own wrong words
--
-- For "hints only" compositions, students get their labels through
-- my_hint_tags() (v16), without anything that gives away the answer. The new
-- "My Error Patterns" page marks the exact words that went wrong in each of
-- the student's sentences, so the function now also returns item_learner —
-- the student's OWN words for that label (e.g. 返 in 这返影了…), only when
-- they appear in the composition. The right words (item_target) are still
-- never returned.
--
-- This only replaces my_hint_tags() with the same function plus that one
-- field. No table or data changes. Run in the Supabase SQL Editor, in a NEW
-- query tab containing only this file — before or after pushing the new
-- code, either order works (until both are done, the page marks every
-- problem in the sentence instead of the ones for that kind of error).
-- Safe to run again.
-- ============================================

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
    -- the student's own wrong words for this label (never the right ones), when found in the composition
    'item_learner', CASE
      WHEN coalesce(t.item_learner, '') <> '' AND strpos(s.final_text, t.item_learner) > 0 THEN t.item_learner
    END,
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

REVOKE ALL ON FUNCTION public.my_hint_tags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_hint_tags() TO anon, authenticated;
