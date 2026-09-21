-- ============================================
-- Migration v10: lock down composition photos and feedback inserts
-- Run in the Supabase SQL Editor AFTER the new code is deployed
-- (the old code uploads to the bucket root and uses public URLs).
-- ============================================

-- 1) Private bucket, images only, max 10 MB
UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id = 'compositions';

DROP POLICY IF EXISTS "Anyone can upload" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read" ON storage.objects;
DROP POLICY IF EXISTS "Students upload composition photos to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Read photos of visible submissions" ON storage.objects;

-- Logged-in users (incl. guest accounts) upload only into their own folder: <user id>/<file>
CREATE POLICY "Students upload composition photos to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'compositions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- A photo can be read by whoever can read a submission that uses it
-- (the student who wrote it, or the teacher of that class — enforced by the submissions RLS).
CREATE POLICY "Read photos of visible submissions" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'compositions'
    AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.image_path = objects.name)
  );

-- 2) A submission may only point at a photo in the student's own folder
--    (otherwise someone could attach another student's photo path and read it).
DROP POLICY IF EXISTS "Students can create submissions" ON submissions;
CREATE POLICY "Students can create submissions" ON submissions
  FOR INSERT WITH CHECK (
    auth.uid() = student_id
    AND (image_path IS NULL OR image_path LIKE auth.uid()::text || '/%')
  );

-- 3) Feedback and error tags could be inserted by anyone for any submission.
--    Only the student's own submission request creates them.
DROP POLICY IF EXISTS "Anyone can insert feedback" ON feedback;
DROP POLICY IF EXISTS "Students insert feedback for own submissions" ON feedback;
CREATE POLICY "Students insert feedback for own submissions" ON feedback
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM submissions s WHERE s.id = feedback.submission_id AND s.student_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can insert error tags" ON error_tags;
DROP POLICY IF EXISTS "Students insert error tags for own submissions" ON error_tags;
CREATE POLICY "Students insert error tags for own submissions" ON error_tags
  FOR INSERT WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (SELECT 1 FROM submissions s WHERE s.id = error_tags.submission_id AND s.student_id = auth.uid())
  );
