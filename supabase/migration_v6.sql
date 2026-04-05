-- Migration v6: Add DELETE policies for teacher management
-- Also add UPDATE policy for profiles (teacher can rename students)

-- Classes: teacher can delete own classes
CREATE POLICY "Teachers can delete own classes"
  ON classes FOR DELETE USING (auth.uid() = teacher_id);

-- Class members: teacher can remove students from their class
CREATE POLICY "Teachers can remove class members"
  ON class_members FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_members.class_id
      AND classes.teacher_id = auth.uid()
    )
  );

-- Projects: teacher can delete projects in their class
CREATE POLICY "Teachers can delete projects"
  ON projects FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = projects.class_id
      AND classes.teacher_id = auth.uid()
    )
  );

-- Projects: teacher can update projects in their class
CREATE POLICY "Teachers can update projects"
  ON projects FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = projects.class_id
      AND classes.teacher_id = auth.uid()
    )
  );

-- Submissions: teacher can delete submissions in their class
CREATE POLICY "Teachers can delete submissions"
  ON submissions FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = submissions.class_id
      AND classes.teacher_id = auth.uid()
    )
  );

-- Feedback: teacher can delete feedback (cascades from submission usually)
CREATE POLICY "Teachers can delete feedback"
  ON feedback FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = feedback.submission_id
      AND c.teacher_id = auth.uid()
    )
  );

-- Error tags: teacher can delete error tags
CREATE POLICY "Teachers can delete error tags"
  ON error_tags FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM submissions s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = error_tags.submission_id
      AND c.teacher_id = auth.uid()
    )
  );

-- Profiles: teacher can update student profiles (for renaming)
CREATE POLICY "Teachers can update student profiles"
  ON profiles FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM class_members cm
      JOIN classes c ON c.id = cm.class_id
      WHERE cm.student_id = profiles.id
      AND c.teacher_id = auth.uid()
    )
  );
