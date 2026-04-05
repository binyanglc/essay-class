-- ============================================
-- Migration v2: Simplified error categories + anonymous auth support
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================

-- Drop old constraint and add new one with simplified categories
ALTER TABLE error_tags DROP CONSTRAINT IF EXISTS error_tags_error_type_check;
ALTER TABLE error_tags ADD CONSTRAINT error_tags_error_type_check
  CHECK (error_type IN (
    'vocabulary', 'grammar', 'content', 'structure',
    'characters', 'punctuation'
  ));

-- Update the profile trigger to handle anonymous users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    new.id,
    COALESCE(new.email, ''),
    COALESCE(new.raw_user_meta_data->>'name', 'Guest'),
    COALESCE(new.raw_user_meta_data->>'role', 'student')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
