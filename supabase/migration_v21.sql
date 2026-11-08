-- ============================================
-- Migration v21: several teachers per class
--
-- A class can now have more than one teacher. The teacher who created the
-- class (classes.teacher_id) adds colleagues by the email they signed up
-- with; they must already have a teacher account. Teachers who were added
-- can do everything with the class's work that the creator can: see and edit
-- the students' compositions, corrections, labels and comments, release
-- feedback, create and change assignments, manage students, rename the class
-- and make a new invite code. Only the creator can delete the class or change
-- who teaches it (an added teacher can leave the class).
--
--   - class_teachers: the teachers added to a class (the creator is not in
--     it — they stay in classes.teacher_id, as before).
--   - my_teacher_classes() / is_class_teacher(): the classes the caller
--     teaches (created or added to). Every rule that used to check
--     "classes.teacher_id = auth.uid()" now checks these instead.
--   - classes.teacher_id (the creator) can't be changed from the site.
--   - feedback.teacher_edited_by: who last saved changes to a feedback (set
--     by the database itself whenever teacher_edited_at changes).
--
-- Nothing that already exists changes: every class keeps its creator, and no
-- one else is added. Run in the Supabase SQL Editor, in a NEW query tab
-- containing only this file, BEFORE pushing the new code (after v20). Safe
-- to run again. If it stops with "lock timeout" or "deadlock detected",
-- nothing was changed (the site was saving something at that moment): just
-- run it again.
-- ============================================

DO $$
BEGIN
  -- Wait at most 5 seconds instead of holding up the site
  SET LOCAL lock_timeout = '5s';
  -- A row being saved locks its own table, then the tables it points to
  -- (labels and comments → feedback → submissions → projects → classes →
  -- profiles). Locking in the same order means this can't wait in a circle
  -- with the site.
  LOCK TABLE public.error_tags, public.feedback_comments, public.feedback,
    public.submissions, public.projects, public.class_members,
    public.classes, public.profiles IN ACCESS EXCLUSIVE MODE;

  -- 1) The teachers added to each class
  CREATE TABLE IF NOT EXISTS public.class_teachers (
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, teacher_id)
  );
  CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON public.class_teachers(teacher_id);
  CREATE INDEX IF NOT EXISTS idx_classes_teacher ON public.classes(teacher_id);
  ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
  GRANT SELECT, INSERT, DELETE ON public.class_teachers TO authenticated;

  -- 2) The classes the caller teaches: created, or added to
  CREATE OR REPLACE FUNCTION public.my_teacher_classes()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT c.id FROM public.classes c WHERE c.teacher_id = auth.uid()
    UNION
    SELECT ct.class_id FROM public.class_teachers ct WHERE ct.teacher_id = auth.uid()
  $fn$;

  CREATE OR REPLACE FUNCTION public.is_class_teacher(p_class_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $fn$
    SELECT auth.uid() IS NOT NULL AND (
      EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.class_teachers ct
        WHERE ct.class_id = p_class_id AND ct.teacher_id = auth.uid()
      )
    )
  $fn$;

  REVOKE ALL ON FUNCTION public.my_teacher_classes() FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.is_class_teacher(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.my_teacher_classes() TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.is_class_teacher(uuid) TO anon, authenticated;

  -- 3) Who sees and changes the list of teachers
  --    See it: every teacher of the class
  DROP POLICY IF EXISTS "Class teachers can see the class's teachers" ON public.class_teachers;
  CREATE POLICY "Class teachers can see the class's teachers" ON public.class_teachers
    FOR SELECT USING (class_id IN (SELECT public.my_teacher_classes()));

  --    Add: only the creator, only someone with a teacher account, never themselves
  DROP POLICY IF EXISTS "Class creator adds teachers" ON public.class_teachers;
  CREATE POLICY "Class creator adds teachers" ON public.class_teachers
    FOR INSERT WITH CHECK (
      added_by = auth.uid()
      AND teacher_id <> auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_teachers.class_id AND c.teacher_id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = class_teachers.teacher_id AND p.role = 'teacher'
      )
    );

  --    Remove: the creator removes anyone; an added teacher can leave
  DROP POLICY IF EXISTS "Class creator removes teachers, teachers can leave" ON public.class_teachers;
  CREATE POLICY "Class creator removes teachers, teachers can leave" ON public.class_teachers
    FOR DELETE USING (
      teacher_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_teachers.class_id AND c.teacher_id = auth.uid()
      )
    );

  -- 4) The creator of a class can't be changed from the site (an added
  --    teacher can rename the class, but not make it theirs). In the SQL
  --    Editor (no logged-in user) it still can be.
  CREATE OR REPLACE FUNCTION public.keep_class_creator()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $fn$
  BEGIN
    IF auth.uid() IS NOT NULL AND (
      NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR NEW.id IS DISTINCT FROM OLD.id
    ) THEN
      RAISE EXCEPTION 'The teacher who created a class can''t be changed';
    END IF;
    RETURN NEW;
  END
  $fn$;
  DROP TRIGGER IF EXISTS keep_class_creator ON public.classes;
  CREATE TRIGGER keep_class_creator BEFORE UPDATE ON public.classes
    FOR EACH ROW EXECUTE FUNCTION public.keep_class_creator();

  -- 5) Who last saved changes to a feedback
  ALTER TABLE public.feedback
    ADD COLUMN IF NOT EXISTS teacher_edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

  CREATE OR REPLACE FUNCTION public.set_feedback_editor()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
  AS $fn$
  BEGIN
    -- Whoever changes teacher_edited_at is the editor (from the site this is
    -- always the logged-in teacher; the SQL Editor leaves it as written)
    IF NEW.teacher_edited_at IS DISTINCT FROM OLD.teacher_edited_at AND auth.uid() IS NOT NULL THEN
      NEW.teacher_edited_by := auth.uid();
    ELSIF auth.uid() IS NOT NULL THEN
      NEW.teacher_edited_by := OLD.teacher_edited_by;
    END IF;
    RETURN NEW;
  END
  $fn$;
  DROP TRIGGER IF EXISTS set_feedback_editor ON public.feedback;
  CREATE TRIGGER set_feedback_editor BEFORE UPDATE ON public.feedback
    FOR EACH ROW EXECUTE FUNCTION public.set_feedback_editor();

  -- 6) Every teacher of the class, not only its creator (same rules as
  --    before otherwise)

  -- classes: rename, new invite code (deleting stays with the creator)
  DROP POLICY IF EXISTS "Teachers can update own classes" ON public.classes;
  CREATE POLICY "Teachers can update own classes" ON public.classes
    FOR UPDATE USING (id IN (SELECT public.my_teacher_classes()));

  -- class_members: remove a student
  DROP POLICY IF EXISTS "Teachers can remove class members" ON public.class_members;
  CREATE POLICY "Teachers can remove class members" ON public.class_members
    FOR DELETE USING (class_id IN (SELECT public.my_teacher_classes()));

  -- profiles: rename a student in the class
  DROP POLICY IF EXISTS "Teachers can update student profiles" ON public.profiles;
  CREATE POLICY "Teachers can update student profiles" ON public.profiles
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.class_members cm
        WHERE cm.student_id = profiles.id
          AND cm.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  -- projects (assignments). v4 and v6 both had an update rule; one is enough.
  DROP POLICY IF EXISTS "Teachers can create projects" ON public.projects;
  CREATE POLICY "Teachers can create projects" ON public.projects
    FOR INSERT WITH CHECK (class_id IN (SELECT public.my_teacher_classes()));

  DROP POLICY IF EXISTS "Teachers can update own projects" ON public.projects;
  DROP POLICY IF EXISTS "Teachers can update projects" ON public.projects;
  CREATE POLICY "Teachers can update projects" ON public.projects
    FOR UPDATE USING (class_id IN (SELECT public.my_teacher_classes()));

  DROP POLICY IF EXISTS "Teachers can delete projects" ON public.projects;
  CREATE POLICY "Teachers can delete projects" ON public.projects
    FOR DELETE USING (class_id IN (SELECT public.my_teacher_classes()));

  -- submissions
  DROP POLICY IF EXISTS "Users can read relevant submissions" ON public.submissions;
  CREATE POLICY "Users can read relevant submissions" ON public.submissions
    FOR SELECT USING (
      auth.uid() = student_id
      OR class_id IN (SELECT public.my_teacher_classes())
    );

  DROP POLICY IF EXISTS "Teachers can delete submissions" ON public.submissions;
  CREATE POLICY "Teachers can delete submissions" ON public.submissions
    FOR DELETE USING (class_id IN (SELECT public.my_teacher_classes()));

  -- feedback (students: as in v16)
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
            OR s.class_id IN (SELECT public.my_teacher_classes())
          )
      )
    );

  DROP POLICY IF EXISTS "Teachers can update feedback" ON public.feedback;
  CREATE POLICY "Teachers can update feedback" ON public.feedback
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = feedback.submission_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  DROP POLICY IF EXISTS "Teachers can delete feedback" ON public.feedback;
  CREATE POLICY "Teachers can delete feedback" ON public.feedback
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = feedback.submission_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  -- error tags (students: as in v16)
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
        WHERE s.id = error_tags.submission_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  DROP POLICY IF EXISTS "Teachers insert error tags for their class submissions" ON public.error_tags;
  CREATE POLICY "Teachers insert error tags for their class submissions" ON public.error_tags
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = error_tags.submission_id
          AND s.student_id = error_tags.student_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  DROP POLICY IF EXISTS "Teachers can update error tags" ON public.error_tags;
  CREATE POLICY "Teachers can update error tags" ON public.error_tags
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = error_tags.submission_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  DROP POLICY IF EXISTS "Teachers can delete error tags" ON public.error_tags;
  CREATE POLICY "Teachers can delete error tags" ON public.error_tags
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.submissions s
        WHERE s.id = error_tags.submission_id
          AND s.class_id IN (SELECT public.my_teacher_classes())
      )
    );

  -- 7) Comments (v16): the student once released, and every class teacher
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
          OR public.is_class_teacher(s.class_id)
        )
    )
  $fn$;

  -- 8) "Hints only" feedback (v19, unchanged except: every class teacher)
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
        OR public.is_class_teacher(s.class_id)
      )
  $fn$;

  REVOKE ALL ON FUNCTION public.can_discuss_feedback(uuid) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.feedback_hints(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.can_discuss_feedback(uuid) TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.feedback_hints(uuid) TO anon, authenticated;
END
$$;
