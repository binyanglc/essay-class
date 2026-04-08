-- Migration v8: Feedback comments — student/teacher discussion on feedback sections

CREATE TABLE feedback_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feedback_id UUID REFERENCES feedback(id) ON DELETE CASCADE NOT NULL,
  section TEXT NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_feedback_comments_feedback ON feedback_comments(feedback_id, section, created_at);

ALTER TABLE feedback_comments ENABLE ROW LEVEL SECURITY;

-- Students can read comments on their own submissions' feedback
-- Teachers can read comments on feedback for submissions in their classes
CREATE POLICY "Users can read relevant comments"
  ON feedback_comments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM feedback f
      JOIN submissions s ON s.id = f.submission_id
      WHERE f.id = feedback_comments.feedback_id
      AND (
        s.student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM classes c WHERE c.id = s.class_id AND c.teacher_id = auth.uid())
      )
    )
  );

-- Anyone logged in can insert comments on feedback they can access
CREATE POLICY "Users can insert comments"
  ON feedback_comments FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM feedback f
      JOIN submissions s ON s.id = f.submission_id
      WHERE f.id = feedback_comments.feedback_id
      AND (
        s.student_id = auth.uid()
        OR EXISTS (SELECT 1 FROM classes c WHERE c.id = s.class_id AND c.teacher_id = auth.uid())
      )
    )
  );

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON feedback_comments FOR DELETE USING (auth.uid() = user_id);
