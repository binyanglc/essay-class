-- ============================================
-- Migration v3: Specific error patterns + content/structure feedback
-- Run this in Supabase SQL Editor
-- ============================================

-- Add pattern tracking fields to error_tags
ALTER TABLE error_tags ADD COLUMN IF NOT EXISTS pattern_name text;
ALTER TABLE error_tags ADD COLUMN IF NOT EXISTS improvement_tip text;

-- Add content and structure feedback to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS content_feedback text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS structure_feedback text;

-- Add per-section AI comments to feedback table
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS characters_comment text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS vocabulary_comment text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS grammar_comment text;
