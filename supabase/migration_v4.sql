-- ============================================
-- Migration v4: Projects + Teacher feedback editing
-- Run this in Supabase SQL Editor
-- ============================================

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
  project_name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_class ON projects(class_id, created_at DESC);

-- Add project_id to submissions (nullable for old data)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_project ON submissions(project_id, created_at DESC);

-- Teacher edit tracking on feedback
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS teacher_edited_at timestamptz;

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read projects" ON projects FOR SELECT USING (true);
CREATE POLICY "Teachers can create projects" ON projects FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = projects.class_id AND classes.teacher_id = auth.uid())
);
CREATE POLICY "Teachers can update own projects" ON projects FOR UPDATE USING (
  EXISTS (SELECT 1 FROM classes WHERE classes.id = projects.class_id AND classes.teacher_id = auth.uid())
);

-- Allow teachers to update feedback for their class submissions
CREATE POLICY "Teachers can update feedback" ON feedback FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM submissions s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = feedback.submission_id AND c.teacher_id = auth.uid()
  )
);
