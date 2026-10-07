-- ============================================
-- Migration v12: fixed error label list (taxonomy v1)
--
-- Adds what the new labels record: the label code (e.g. GRAM.LE), the misuse
-- rule, the exact words ("认识 ← 知道"), whether it is an error or just not
-- natural, who labelled it and whether the teacher has checked it. Labels the
-- teacher removes are kept (with an optional reason) for research, but they
-- are hidden from students and not counted anywhere.
--
-- Older labels keep working as they are (all new columns are empty for them).
--
-- Run in the Supabase SQL Editor, in a NEW query tab containing only this
-- file, BEFORE pushing the new code. Safe to run again. If it stops with
-- "lock timeout", nothing was changed (the site was using error_tags at that
-- moment): just run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds for the table instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- Lock error_tags first, so this can't wait in a circle with the site's queries
  LOCK TABLE public.error_tags IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE public.error_tags
    ADD COLUMN IF NOT EXISTS code text,
    ADD COLUMN IF NOT EXISTS rule text,
    ADD COLUMN IF NOT EXISTS item_target text,
    ADD COLUMN IF NOT EXISTS item_learner text,
    ADD COLUMN IF NOT EXISTS grammar_point text,
    ADD COLUMN IF NOT EXISTS nature text,
    ADD COLUMN IF NOT EXISTS severity text,
    ADD COLUMN IF NOT EXISTS operation text,
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS status text,
    ADD COLUMN IF NOT EXISTS delete_reason text,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS custom_label text,
    ADD COLUMN IF NOT EXISTS revision_id text,
    ADD COLUMN IF NOT EXISTS ai_original jsonb,
    ADD COLUMN IF NOT EXISTS taxonomy_version text,
    ADD COLUMN IF NOT EXISTS model text;

  -- New label groups: punctuation already existed; discourse, register, expression are new
  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_error_type_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_error_type_check CHECK (error_type IN (
    'vocabulary', 'grammar', 'content', 'structure', 'characters', 'punctuation',
    'discourse', 'register', 'expression'
  ));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_code_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_code_check
    CHECK (code IS NULL OR code ~ '^[A-Z]+\.[A-Z_]+$');

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_rule_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_rule_check
    CHECK (rule IS NULL OR rule ~ '^R\.[A-Z]+\.[A-Z_]+$');

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_nature_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_nature_check
    CHECK (nature IS NULL OR nature IN ('error', 'infelicity', 'variant'));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_severity_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_severity_check
    CHECK (severity IS NULL OR severity IN ('global', 'local'));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_operation_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_operation_check
    CHECK (operation IS NULL OR operation IN ('missing', 'unnecessary', 'replace', 'order'));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_source_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_source_check
    CHECK (source IS NULL OR source IN ('ai', 'teacher'));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_status_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_status_check
    CHECK (status IS NULL OR status IN ('suggested', 'confirmed', 'modified', 'added', 'deleted'));

  ALTER TABLE public.error_tags DROP CONSTRAINT IF EXISTS error_tags_delete_reason_check;
  ALTER TABLE public.error_tags ADD CONSTRAINT error_tags_delete_reason_check
    CHECK (delete_reason IS NULL OR delete_reason IN ('ai_wrong', 'not_error', 'not_now'));

  CREATE INDEX IF NOT EXISTS idx_error_tags_code ON public.error_tags(code);

  -- Students don't see labels their teacher removed (teachers still do, for the record)
  DROP POLICY IF EXISTS "Users can read relevant error tags" ON public.error_tags;
  CREATE POLICY "Users can read relevant error tags" ON public.error_tags
    FOR SELECT USING (
      (auth.uid() = student_id AND status IS DISTINCT FROM 'deleted')
      OR EXISTS (
        SELECT 1 FROM public.submissions s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = error_tags.submission_id
          AND c.teacher_id = auth.uid()
      )
    );

  -- The AI's labels are saved by the student's own submission request: they
  -- can only be unchecked AI suggestions, never "confirmed by teacher"
  DROP POLICY IF EXISTS "Students insert error tags for own submissions" ON public.error_tags;
  CREATE POLICY "Students insert error tags for own submissions" ON public.error_tags
    FOR INSERT WITH CHECK (
      auth.uid() = student_id
      AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.id = error_tags.submission_id AND s.student_id = auth.uid())
      AND (status IS NULL OR status = 'suggested')
      AND (source IS NULL OR source = 'ai')
    );
END
$$;
