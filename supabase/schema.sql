-- ============================================
-- Chinese Writing Feedback Platform - Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text not null default '',
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz default now()
);

-- Classes
create table classes (
  id uuid default gen_random_uuid() primary key,
  class_name text not null,
  teacher_id uuid references profiles(id) on delete cascade not null,
  invite_code text unique not null,
  created_at timestamptz default now()
);

-- Class members (student-class relationship)
create table class_members (
  id uuid default gen_random_uuid() primary key,
  class_id uuid references classes(id) on delete cascade not null,
  student_id uuid references profiles(id) on delete cascade not null,
  joined_at timestamptz default now(),
  unique(class_id, student_id)
);

-- Submissions
create table submissions (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references profiles(id) on delete cascade not null,
  class_id uuid references classes(id) on delete cascade not null,
  title text,
  assignment_name text,
  image_url text,
  ocr_text text,
  final_text text not null,
  created_at timestamptz default now()
);

-- Feedback (one per submission)
create table feedback (
  id uuid default gen_random_uuid() primary key,
  submission_id uuid references submissions(id) on delete cascade not null unique,
  overall_comment text,
  strengths jsonb default '[]'::jsonb,
  main_problems jsonb default '[]'::jsonb,
  sentence_revisions jsonb default '[]'::jsonb,
  repeated_error_summary text,
  next_step_advice text,
  created_at timestamptz default now()
);

-- Structured error tags
create table error_tags (
  id uuid default gen_random_uuid() primary key,
  submission_id uuid references submissions(id) on delete cascade not null,
  student_id uuid references profiles(id) on delete cascade not null,
  error_type text not null check (error_type in (
    'vocabulary_word_choice', 'collocation', 'grammar_le', 'grammar_de',
    'word_order', 'punctuation', 'coherence_transition', 'register_style',
    'character_error', 'other'
  )),
  original_text text,
  suggested_revision text,
  explanation text,
  sentence_index integer,
  created_at timestamptz default now()
);

-- Index for fast error history queries
create index idx_error_tags_student on error_tags(student_id, created_at desc);
create index idx_error_tags_submission on error_tags(submission_id);
create index idx_submissions_student on submissions(student_id, created_at desc);
create index idx_submissions_class on submissions(class_id, created_at desc);
create index idx_class_members_class on class_members(class_id);
create index idx_class_members_student on class_members(student_id);

-- Auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- Row Level Security
-- ============================================

alter table profiles enable row level security;
alter table classes enable row level security;
alter table class_members enable row level security;
alter table submissions enable row level security;
alter table feedback enable row level security;
alter table error_tags enable row level security;

-- Profiles: users can read all profiles, update own
create policy "Anyone can read profiles" on profiles for select using (true);
create policy "Users can update own profile" on profiles for update using (auth.uid() = id);

-- Classes: teachers can create, everyone can read
create policy "Anyone can read classes" on classes for select using (true);
create policy "Teachers can create classes" on classes for insert with check (auth.uid() = teacher_id);
create policy "Teachers can update own classes" on classes for update using (auth.uid() = teacher_id);

-- Class members: students can join, teachers can view their class members
create policy "Anyone can read class members" on class_members for select using (true);
create policy "Students can join classes" on class_members for insert with check (auth.uid() = student_id);

-- Submissions: students create own, teachers can read class submissions
create policy "Students can create submissions" on submissions for insert with check (auth.uid() = student_id);
create policy "Users can read relevant submissions" on submissions for select using (
  auth.uid() = student_id
  or exists (select 1 from classes where classes.id = submissions.class_id and classes.teacher_id = auth.uid())
);

-- Feedback: system creates, users read relevant
create policy "Anyone can insert feedback" on feedback for insert with check (true);
create policy "Users can read relevant feedback" on feedback for select using (
  exists (
    select 1 from submissions s
    where s.id = feedback.submission_id
    and (s.student_id = auth.uid()
      or exists (select 1 from classes c where c.id = s.class_id and c.teacher_id = auth.uid()))
  )
);

-- Error tags: system creates, users read relevant
create policy "Anyone can insert error tags" on error_tags for insert with check (true);
create policy "Users can read relevant error tags" on error_tags for select using (
  auth.uid() = student_id
  or exists (
    select 1 from submissions s
    join classes c on c.id = s.class_id
    where s.id = error_tags.submission_id and c.teacher_id = auth.uid()
  )
);

-- Storage bucket for uploaded images
insert into storage.buckets (id, name, public) values ('compositions', 'compositions', true)
on conflict do nothing;

create policy "Anyone can upload" on storage.objects for insert with check (bucket_id = 'compositions');
create policy "Anyone can read" on storage.objects for select using (bucket_id = 'compositions');
