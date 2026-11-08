import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A teacher's place in a class: the teacher who created it, or a teacher the
 * creator added (migration v21). Both can do everything with the class's work;
 * only the creator can delete the class or change who teaches it.
 */
export type ClassRole = 'owner' | 'co_teacher';

/** The user's role in a class, or null if they don't teach it. */
export async function classRole(
  supabase: SupabaseClient,
  classId: string,
  userId: string
): Promise<ClassRole | null> {
  const { data: cls } = await supabase.from('classes').select('teacher_id').eq('id', classId).maybeSingle();
  if (!cls) return null;
  if (cls.teacher_id === userId) return 'owner';
  const { data: row, error } = await supabase
    .from('class_teachers')
    .select('class_id')
    .eq('class_id', classId)
    .eq('teacher_id', userId)
    .maybeSingle();
  // Before migration v21 there is no class_teachers table: only the creator teaches the class
  if (error || !row) return null;
  return 'co_teacher';
}

/** Whether the user teaches the class (created it or was added to it). */
export async function isClassTeacher(supabase: SupabaseClient, classId: string, userId: string): Promise<boolean> {
  return (await classRole(supabase, classId, userId)) !== null;
}

/** For looking up an account by the email typed in: trimmed, lower case, no LIKE wildcards. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Escapes % _ and \ so an email can be matched with ilike (case-insensitive, nothing else). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
