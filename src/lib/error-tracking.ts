import { SupabaseClient } from '@supabase/supabase-js';
import { ErrorFrequency, ErrorPattern, ErrorTag, ErrorType } from '@/types';
import {
  DOMAINS,
  familyKey,
  familyLabel,
  getCode,
  isActive,
  isUnconfirmedAi,
  itemKey,
  itemLabel,
  tagLabel,
} from './error-taxonomy';

/**
 * Counting error labels — for Common Issues (a class) and "My Error Patterns"
 * (one student). Labels are grouped by kind (Grammar…), then family (the label
 * code, e.g. 了), then the exact item (a misuse rule or a pair of words).
 * Labels the teacher removed are never counted; "not natural" suggestions are
 * counted only when asked for, and variants (not wrong) never.
 */

export interface ItemSummary {
  key: string;
  name: string;
  count: number;
  essays: number;
  students: number;
}

export interface LabelExample {
  id: string;
  original: string;
  revision: string;
  explanation: string;
  /** The label as shown, e.g. "了 (le) · No 了 after 没 (negative sentences)". */
  label: string;
  /** AI suggestion the teacher hasn't checked. */
  unchecked: boolean;
}

export interface FamilySummary {
  key: string;
  /** Label code; null for labels from before the label list. */
  code: string | null;
  name: string;
  zh?: string;
  count: number;
  essays: number;
  students: number;
  /** How many are AI suggestions nobody has checked. */
  unchecked: number;
  items: ItemSummary[];
  examples: LabelExample[];
  /** What the family is about (or the AI's study tip, for older labels). */
  tip: string;
}

export interface IssueGroup {
  error_type: ErrorType;
  count: number;
  students: number;
  families: FamilySummary[];
}

export interface SummaryOptions {
  /** Also count "not natural" (style) suggestions. */
  includeStyle?: boolean;
  /** Examples kept per family. */
  examples?: number;
}

/** Groups labels (most recent first) into kinds → families → items. */
export function summarizeLabels(
  tags: ErrorTag[],
  opts: SummaryOptions = {}
): { groups: IssueGroup[]; styleCount: number } {
  const maxExamples = opts.examples ?? 5;
  let styleCount = 0;

  type Acc = {
    count: number;
    students: Set<string>;
    families: Map<
      string,
      {
        sample: ErrorTag;
        count: number;
        subs: Set<string>;
        students: Set<string>;
        unchecked: number;
        items: Map<string, { name: string; count: number; subs: Set<string>; students: Set<string> }>;
        examples: LabelExample[];
        tip: string;
      }
    >;
  };
  const groups = new Map<string, Acc>();

  for (const t of tags) {
    if (!isActive(t)) continue;
    if (t.nature === 'variant') continue;
    if (t.nature === 'infelicity' && !opts.includeStyle) {
      styleCount++;
      continue;
    }
    let g = groups.get(t.error_type);
    if (!g) {
      g = { count: 0, students: new Set(), families: new Map() };
      groups.set(t.error_type, g);
    }
    g.count++;
    g.students.add(t.student_id);

    const fk = familyKey(t);
    let f = g.families.get(fk);
    if (!f) {
      f = {
        sample: t,
        count: 0,
        subs: new Set(),
        students: new Set(),
        unchecked: 0,
        items: new Map(),
        examples: [],
        tip: getCode(t.code)?.definition ?? '',
      };
      g.families.set(fk, f);
    }
    f.count++;
    f.subs.add(t.submission_id);
    f.students.add(t.student_id);
    if (isUnconfirmedAi(t)) f.unchecked++;
    if (!f.tip && t.improvement_tip) f.tip = t.improvement_tip;

    const ik = itemKey(t);
    if (ik) {
      let it = f.items.get(ik);
      if (!it) {
        it = { name: itemLabel(t), count: 0, subs: new Set(), students: new Set() };
        f.items.set(ik, it);
      }
      it.count++;
      it.subs.add(t.submission_id);
      it.students.add(t.student_id);
    }

    if (f.examples.length < maxExamples) {
      f.examples.push({
        id: t.id,
        original: t.original_text || '',
        revision: t.suggested_revision || '',
        explanation: t.explanation || '',
        label: tagLabel(t),
        unchecked: isUnconfirmedAi(t),
      });
    }
  }

  const out: IssueGroup[] = Array.from(groups.entries()).map(([error_type, g]) => ({
    error_type: error_type as ErrorType,
    count: g.count,
    students: g.students.size,
    families: Array.from(g.families.entries())
      .map(([key, f]) => {
        const code = getCode(f.sample.code);
        return {
          key,
          code: code?.code ?? null,
          name: familyLabel(f.sample),
          // The Chinese name, unless the English one already shows it (了 (le))
          zh: code && !code.en.includes(code.zh) ? code.zh : undefined,
          count: f.count,
          essays: f.subs.size,
          students: f.students.size,
          unchecked: f.unchecked,
          items: Array.from(f.items.entries())
            .map(([k, it]) => ({ key: k, name: it.name, count: it.count, essays: it.subs.size, students: it.students.size }))
            .sort((a, b) => b.count - a.count),
          examples: f.examples,
          tip: f.tip,
        };
      })
      .sort((a, b) => b.count - a.count),
  }));
  out.sort((a, b) => b.count - a.count);
  return { groups: out, styleCount };
}

/** Kinds in the usual order (Characters, Vocabulary, Grammar, …), not by count. */
export function inDomainOrder(groups: IssueGroup[]): IssueGroup[] {
  const order = DOMAINS.map((d) => d.errorType as string);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return [...groups].sort((a, b) => rank(a.error_type) - rank(b.error_type));
}

async function studentTags(supabase: SupabaseClient, studentId: string): Promise<ErrorTag[]> {
  const [{ data }, hintTags, laterDrafts] = await Promise.all([
    supabase
      .from('error_tags')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(500),
    ownHintTags(supabase, studentId),
    laterDraftIds(supabase, studentId),
  ]);
  // A problem counts once per composition: in the first draft (later drafts repeat what wasn't fixed yet)
  const firstDrafts = (t: ErrorTag) => !laterDrafts.has(t.submission_id);
  const rows = ((data ?? []) as ErrorTag[]).filter(firstDrafts);
  // Students can't read labels from "hints only" feedback directly; they get them without the answers
  const seen = new Set(rows.map((t) => t.id));
  const extra = hintTags.filter((t) => !seen.has(t.id) && firstDrafts(t));
  if (extra.length === 0) return rows.filter(isActive);
  // Newest first; labels saved at the same moment keep their order (stable sort)
  return [...rows, ...extra]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, 500)
    .filter(isActive);
}

/** The student's second and third drafts (migration v17); empty if that can't be checked. */
async function laterDraftIds(supabase: SupabaseClient, studentId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, draft_number')
    .eq('student_id', studentId)
    .gt('draft_number', 1);
  if (error || !data) return new Set();
  return new Set((data as { id: string }[]).map((d) => d.id));
}

/**
 * The signed-in student's own labels from released "hints only" feedback
 * (migration v16), without the right answers. Empty for anyone else (a
 * teacher reads those labels in full above), or if it can't be checked.
 */
async function ownHintTags(supabase: SupabaseClient, studentId: string): Promise<ErrorTag[]> {
  const { data, error } = await supabase.rpc('my_hint_tags');
  if (error || !Array.isArray(data)) return [];
  return (data as Partial<ErrorTag>[])
    .filter((t) => t.student_id === studentId)
    .map((t) => ({
      pattern_name: '',
      suggested_revision: '',
      explanation: '',
      improvement_tip: '',
      sentence_index: null,
      ...t,
    })) as ErrorTag[];
}

/** One student's labels, for "My Error Patterns" (style suggestions included). */
export async function getStudentLabelSummary(
  supabase: SupabaseClient,
  studentId: string
): Promise<{ groups: IssueGroup[]; unchecked: number }> {
  const tags = await studentTags(supabase, studentId);
  const { groups } = summarizeLabels(tags, { includeStyle: true, examples: 6 });
  return { groups: inDomainOrder(groups), unchecked: tags.filter(isUnconfirmedAi).length };
}

/** The student's most frequent label families — the AI sees these when it corrects the next composition. */
export async function getStudentErrorPatterns(
  supabase: SupabaseClient,
  studentId: string
): Promise<ErrorPattern[]> {
  const tags = await studentTags(supabase, studentId);
  const { groups } = summarizeLabels(tags, { examples: 5 });
  return groups
    .flatMap((g) =>
      g.families.map((f) => ({
        pattern_name: f.items.length > 0 ? `${f.name} — ${f.items[0].name}` : f.name,
        error_type: g.error_type,
        count: f.count,
        examples: f.examples.map((e) => ({ original: e.original, revision: e.revision, explanation: e.explanation })),
        improvement_tip: f.tip,
      }))
    )
    .sort((a, b) => b.count - a.count);
}

/** Counts per kind of label (teacher's student page). */
export async function getStudentErrorHistory(
  supabase: SupabaseClient,
  studentId: string
): Promise<ErrorFrequency[]> {
  const tags = await studentTags(supabase, studentId);
  const { groups } = summarizeLabels(tags, { examples: 5 });
  return groups.map((g) => ({
    error_type: g.error_type,
    count: g.count,
    examples: g.families.flatMap((f) => f.examples).slice(0, 5).map((e) => ({ original: e.original, revision: e.revision })),
  }));
}

export function categorizeErrorFrequency(count: number): string {
  if (count >= 5) return 'Recurring';
  if (count >= 3) return 'Frequent';
  if (count >= 2) return 'Occasional';
  return 'First time';
}

/** How often a problem comes back, counted in compositions (not single mistakes). */
export function categorizeByEssays(essays: number): string {
  if (essays >= 3) return 'Keeps coming back';
  if (essays === 2) return 'In 2 compositions';
  return 'In 1 composition';
}

export async function getClassErrorSummary(
  supabase: SupabaseClient,
  classId: string,
  options?: {
    since?: string;
    projectId?: string;
    assignmentName?: string;
    includeStyle?: boolean;
    /** Which draft of each composition counts (migration v17): the first (default) or the latest. */
    draft?: 'first' | 'latest';
  }
) {
  const { data: allSubs } = await (() => {
    let q = supabase.from('submissions').select('id, first_draft_id, draft_number').eq('class_id', classId);
    if (options?.since) q = q.gte('created_at', options.since);
    if (options?.projectId) q = q.eq('project_id', options.projectId);
    if (options?.assignmentName) q = q.eq('assignment_name', options.assignmentName);
    return q;
  })();
  const submissions = pickDrafts(
    (allSubs ?? []) as { id: string; first_draft_id?: string | null; draft_number?: number | null }[],
    options?.draft ?? 'first'
  );

  if (!submissions || submissions.length === 0) {
    return { errorTypes: [] as IssueGroup[], totalSubmissions: 0, styleCount: 0 };
  }

  const submissionIds = submissions.map((s) => s.id);

  // Worked out from the saved labels every time, so teachers' changes show up straight away
  const { data: errorTags } = await supabase
    .from('error_tags')
    .select('*')
    .in('submission_id', submissionIds)
    .order('created_at', { ascending: false });

  const { groups, styleCount } = summarizeLabels((errorTags ?? []) as ErrorTag[], {
    includeStyle: options?.includeStyle,
  });
  return { errorTypes: groups, totalSubmissions: submissions.length, styleCount };
}

/** One submission per composition: its first draft, or its latest draft. */
export function pickDrafts<T extends { id: string; first_draft_id?: string | null; draft_number?: number | null }>(
  subs: T[],
  which: 'first' | 'latest'
): T[] {
  if (which === 'first') return subs.filter((s) => (s.draft_number ?? 1) === 1);
  const latest = new Map<string, T>();
  for (const s of subs) {
    const key = s.first_draft_id ?? s.id;
    const cur = latest.get(key);
    if (!cur || (s.draft_number ?? 1) > (cur.draft_number ?? 1)) latest.set(key, s);
  }
  return [...latest.values()];
}
