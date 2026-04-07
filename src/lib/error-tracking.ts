import { SupabaseClient } from '@supabase/supabase-js';
import { ErrorFrequency, ErrorPattern, ErrorType } from '@/types';

export async function getStudentErrorPatterns(
  supabase: SupabaseClient,
  studentId: string
): Promise<ErrorPattern[]> {
  const { data: errorTags } = await supabase
    .from('error_tags')
    .select('error_type, pattern_name, original_text, suggested_revision, explanation, improvement_tip')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(300);

  if (!errorTags || errorTags.length === 0) return [];

  const patternMap = new Map<
    string,
    {
      error_type: string;
      count: number;
      examples: { original: string; revision: string; explanation: string }[];
      improvement_tip: string;
    }
  >();

  for (const tag of errorTags) {
    const key = tag.pattern_name || tag.error_type;
    const existing = patternMap.get(key);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) {
        existing.examples.push({
          original: tag.original_text || '',
          revision: tag.suggested_revision || '',
          explanation: tag.explanation || '',
        });
      }
    } else {
      patternMap.set(key, {
        error_type: tag.error_type,
        count: 1,
        examples: [
          {
            original: tag.original_text || '',
            revision: tag.suggested_revision || '',
            explanation: tag.explanation || '',
          },
        ],
        improvement_tip: tag.improvement_tip || '',
      });
    }
  }

  return Array.from(patternMap.entries())
    .map(([pattern_name, data]) => ({
      pattern_name,
      error_type: data.error_type as ErrorType,
      count: data.count,
      examples: data.examples,
      improvement_tip: data.improvement_tip,
    }))
    .sort((a, b) => b.count - a.count);
}

// Keep for backward compatibility (teacher dashboard etc.)
export async function getStudentErrorHistory(
  supabase: SupabaseClient,
  studentId: string
): Promise<ErrorFrequency[]> {
  const patterns = await getStudentErrorPatterns(supabase, studentId);
  const typeMap = new Map<string, { count: number; examples: { original: string; revision: string }[] }>();

  for (const p of patterns) {
    const existing = typeMap.get(p.error_type);
    if (existing) {
      existing.count += p.count;
      existing.examples.push(...p.examples.map(e => ({ original: e.original, revision: e.revision })));
    } else {
      typeMap.set(p.error_type, {
        count: p.count,
        examples: p.examples.map(e => ({ original: e.original, revision: e.revision })),
      });
    }
  }

  return Array.from(typeMap.entries())
    .map(([error_type, data]) => ({
      error_type: error_type as ErrorType,
      count: data.count,
      examples: data.examples.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count);
}

export function categorizeErrorFrequency(count: number): string {
  if (count >= 5) return 'Recurring';
  if (count >= 3) return 'Frequent';
  if (count >= 2) return 'Occasional';
  return 'First time';
}

export async function getClassErrorSummary(
  supabase: SupabaseClient,
  classId: string,
  options?: { since?: string; projectId?: string; assignmentName?: string }
) {
  const { data: submissions } = await (() => {
    let q = supabase.from('submissions').select('id').eq('class_id', classId);
    if (options?.since) q = q.gte('created_at', options.since);
    if (options?.projectId) q = q.eq('project_id', options.projectId);
    if (options?.assignmentName) q = q.eq('assignment_name', options.assignmentName);
    return q;
  })();

  if (!submissions || submissions.length === 0) {
    return { errorTypes: [], totalSubmissions: 0 };
  }

  const submissionIds = submissions.map((s) => s.id);

  const { data: errorTags } = await supabase
    .from('error_tags')
    .select('id, error_type, original_text, suggested_revision, explanation')
    .in('submission_id', submissionIds);

  if (!errorTags) return { errorTypes: [], totalSubmissions: submissions.length };

  const typeMap = new Map<
    string,
    { count: number; examples: { id: string; original: string; revision: string; explanation: string }[] }
  >();

  for (const tag of errorTags) {
    const existing = typeMap.get(tag.error_type);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 5) {
        existing.examples.push({
          id: tag.id,
          original: tag.original_text || '',
          revision: tag.suggested_revision || '',
          explanation: tag.explanation || '',
        });
      }
    } else {
      typeMap.set(tag.error_type, {
        count: 1,
        examples: [{
          id: tag.id,
          original: tag.original_text || '',
          revision: tag.suggested_revision || '',
          explanation: tag.explanation || '',
        }],
      });
    }
  }

  const errorTypes = Array.from(typeMap.entries())
    .map(([error_type, data]) => ({ error_type: error_type as ErrorType, ...data }))
    .sort((a, b) => b.count - a.count);

  return { errorTypes, totalSubmissions: submissions.length };
}
