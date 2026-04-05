import { SupabaseClient } from '@supabase/supabase-js';
import { ErrorFrequency, ErrorType } from '@/types';

export async function getStudentErrorHistory(
  supabase: SupabaseClient,
  studentId: string
): Promise<ErrorFrequency[]> {
  const { data: errorTags } = await supabase
    .from('error_tags')
    .select('error_type, original_text, suggested_revision')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!errorTags || errorTags.length === 0) return [];

  const frequencyMap = new Map<
    string,
    { count: number; examples: { original: string; revision: string }[] }
  >();

  for (const tag of errorTags) {
    const existing = frequencyMap.get(tag.error_type);
    if (existing) {
      existing.count++;
      if (existing.examples.length < 3) {
        existing.examples.push({
          original: tag.original_text || '',
          revision: tag.suggested_revision || '',
        });
      }
    } else {
      frequencyMap.set(tag.error_type, {
        count: 1,
        examples: [
          {
            original: tag.original_text || '',
            revision: tag.suggested_revision || '',
          },
        ],
      });
    }
  }

  return Array.from(frequencyMap.entries())
    .map(([error_type, data]) => ({
      error_type: error_type as ErrorType,
      ...data,
    }))
    .sort((a, b) => b.count - a.count);
}

export function categorizeErrorFrequency(count: number): string {
  if (count >= 5) return '反复出现';
  if (count >= 3) return '多次出现';
  if (count >= 2) return '偶尔出现';
  return '首次出现';
}

export async function getClassErrorSummary(
  supabase: SupabaseClient,
  classId: string,
  options?: { since?: string; assignmentName?: string }
) {
  let query = supabase
    .from('error_tags')
    .select('error_type, original_text, suggested_revision, explanation, submission_id')
    .order('created_at', { ascending: false });

  if (options?.since) {
    query = query.gte('created_at', options.since);
  }

  // Filter by class via submissions
  const { data: submissions } = await (() => {
    let q = supabase
      .from('submissions')
      .select('id')
      .eq('class_id', classId);
    if (options?.since) q = q.gte('created_at', options.since);
    if (options?.assignmentName)
      q = q.eq('assignment_name', options.assignmentName);
    return q;
  })();

  if (!submissions || submissions.length === 0) {
    return { errorTypes: [], totalSubmissions: 0 };
  }

  const submissionIds = submissions.map((s) => s.id);

  const { data: errorTags } = await supabase
    .from('error_tags')
    .select('error_type, original_text, suggested_revision, explanation')
    .in('submission_id', submissionIds);

  if (!errorTags) return { errorTypes: [], totalSubmissions: submissions.length };

  const typeMap = new Map<
    string,
    {
      count: number;
      examples: { original: string; revision: string; explanation: string }[];
    }
  >();

  for (const tag of errorTags) {
    const existing = typeMap.get(tag.error_type);
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
      typeMap.set(tag.error_type, {
        count: 1,
        examples: [
          {
            original: tag.original_text || '',
            revision: tag.suggested_revision || '',
            explanation: tag.explanation || '',
          },
        ],
      });
    }
  }

  const errorTypes = Array.from(typeMap.entries())
    .map(([error_type, data]) => ({ error_type: error_type as ErrorType, ...data }))
    .sort((a, b) => b.count - a.count);

  return { errorTypes, totalSubmissions: submissions.length };
}
