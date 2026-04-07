-- Migration v7: Add UPDATE policy for error_tags (teacher can edit error examples)
CREATE POLICY "Teachers can update error tags"
  ON error_tags FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = error_tags.submission_id
      AND c.teacher_id = auth.uid()
    )
  );
