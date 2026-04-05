-- Migration v5: Add due_date to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ DEFAULT NULL;
