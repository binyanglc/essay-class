/**
 * "My Error Patterns" for a student: their labels grouped by kind of error,
 * each with the student's own sentences (the wrong words marked), the
 * explanation and usage & examples written for that correction, whether the
 * next draft fixed it, and a quick check made from the usage examples.
 *
 * Counted once per composition, from first drafts (later drafts repeat what
 * wasn't fixed yet). For "hints only" compositions nothing gives the answer
 * away: no corrected sentence, and of the label only the student's own words
 * (migration v20) — just like the hints the student already has.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorTag, ErrorType, HintMark, SentenceRevision } from '@/types';
import { DOMAINS, familyKey, familyLabel, getCode, getRule, isActive, isUnconfirmedAi, itemLabel } from './error-taxonomy';
import { studentTags } from './error-tracking';
import { hintMarks, hintPoints, isUsage, usageBlocks } from './hints';
import type { HintItem, UsageBlock, UsageEntry } from './hints';
import { withRevisionIds } from './revisions';
import { draftNumber, draftProgress, itemsFromHints, itemsFromRevisions } from './drafts';
import type { DraftItem, DraftStatus } from './drafts';
import { loadStudentFeedback } from './student-feedback';
import type { StudentFeedback } from './student-feedback';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One correction as the student may see it. */
export interface PatternRevision {
  id: string;
  /** The student's sentence (null when it couldn't be found in the composition). */
  original: string | null;
  /** The corrected sentence — "corrections" assignments only. */
  revised?: string;
  /** Where the problems are in `original`. */
  marks: HintMark[];
  /** Why it is wrong ("Why" in corrections, "Hint" in hints only); '' if the student may not see it. */
  why: string;
  /** Usage & examples (or an older hint). */
  usage: string;
}

/** A first draft the labels come from. */
export interface PatternSource {
  submissionId: string;
  title: string;
  createdAt: string;
  kind: 'corrections' | 'hints';
  revisions: PatternRevision[];
  /** How each correction fared in the next draft, by revision id. */
  statuses?: Map<string, DraftStatus>;
  /** The draft the statuses refer to (2). */
  nextDraft?: number;
}

/** A piece of an example sentence in a fill-in question: text, or a blank with its answer. */
export type PracticePart = string | { blank: string };

/**
 * A practice question made from one usage & examples block (its example
 * sentence), so every problem with an example gets one:
 * - choice: the right word or the one it gets mixed up with, in a blank;
 * - fill: type the right word (or the fixed words of a pattern) into the blanks;
 * - translate: say the example in Chinese, then check.
 */
export type PracticeItem =
  | {
      type: 'choice';
      key: string;
      before: string;
      after: string;
      answer: UsageEntry;
      other: UsageEntry;
      example: UsageEntry;
      /** Show the wrong choice first (fixed per item, so it doesn't jump around). */
      otherFirst: boolean;
    }
  | { type: 'fill'; key: string; parts: PracticePart[]; answer: UsageEntry; example: UsageEntry }
  | { type: 'translate'; key: string; answer: UsageEntry | null; example: UsageEntry };

/** One of the student's sentences with problems of this kind. */
export interface PatternSentence {
  key: string;
  submissionId: string;
  kind: 'corrections' | 'hints' | 'unknown';
  title: string;
  createdAt: string;
  original: string;
  revised?: string;
  marks: HintMark[];
  /** Indexes into `marks` of the problems of this kind (the others are shown faintly). */
  focus: number[];
  /** How many problems of this kind are in the sentence. */
  count: number;
  why: string[];
  usage: string;
  status?: DraftStatus;
  nextDraft?: number;
  unchecked: boolean;
}

export interface PatternChip {
  text: string;
  count: number;
}

export interface PatternFamily {
  key: string;
  name: string;
  zh?: string;
  /** What this kind of error is. */
  about: string;
  count: number;
  compositions: number;
  /** All labels are "not natural" suggestions rather than errors. */
  styleOnly: boolean;
  chips: PatternChip[];
  sentences: PatternSentence[];
  practice: PracticeItem[];
  unchecked: number;
}

export interface PatternGroup {
  error_type: ErrorType;
  count: number;
  families: PatternFamily[];
}

export interface StudentPatterns {
  groups: PatternGroup[];
  /** What to work on first. */
  focus: PatternFamily[];
  unchecked: number;
}

// ---------------------------------------------------------------------------
// Matching a label to the parts of its correction
// ---------------------------------------------------------------------------

const clean = (s: string | null | undefined) => (s ?? '').trim();

/**
 * Whether a piece of text is about one of the student's words: it has the
 * word, is part of it, or has two of its characters in a row (容易 for 容易地).
 */
function mentions(text: string, words: string[]): boolean {
  return words.some((w) => {
    if (text.includes(w) || (text.length > 0 && w.includes(text))) return true;
    for (let i = 0; i + 2 <= w.length; i++) if (text.includes(w.slice(i, i + 2))) return true;
    return false;
  });
}

/**
 * The usage & examples blocks about these words. Without words (labels from
 * before migration v20) all of them; when no block is about the words, none —
 * the sentence's other blocks are about other kinds of error.
 */
export function relevantUsage(usage: string, words: string[]): string {
  const text = clean(usage);
  if (!text || words.length === 0) return text;
  if (isUsage(text)) {
    const blocks = text.split(/\n\s*\n/).filter((b) => b.trim());
    const about = (b: string) => b.trim().split('\n')[0].replace(/[:：]\s*$/, '');
    return blocks.filter((b) => mentions(about(b), words)).join('\n\n');
  }
  return hintPoints(text)
    .filter((p) => mentions(p, words))
    .join('\n');
}

/** The points of an explanation about these words (all of them without words, none when no point is about them). */
export function relevantPoints(why: string, words: string[]): string[] {
  const points = hintPoints(why);
  if (words.length === 0) return points;
  return points.filter((p) => mentions(p, words));
}

/** Which marks belong to these labels: those on the student's words, else missing-word marks for missing words, else all. */
export function focusMarks(original: string, marks: HintMark[], words: string[], missing: boolean): number[] {
  const all = marks.map((_, i) => i);
  if (words.length) {
    const hit = all.filter((i) => {
      const t = original.slice(marks[i].start, marks[i].end);
      return t.length > 0 && words.some((w) => t.includes(w) || w.includes(t));
    });
    if (hit.length) return hit;
  }
  if (missing && words.length === 0) {
    const hit = all.filter((i) => marks[i].kind === 'missing');
    if (hit.length) return hit;
  }
  return all;
}

/**
 * A kind of error's definition as a student reads it: without the label codes
 * and notes meant for teachers ("… is GRAM.ORDER", "use a vocabulary code").
 */
export function studentAbout(definition: string): string {
  const CODE = /[A-Z]{2,}\.[A-Z_]+/;
  const text = definition
    .replace(/a more specific code/g, 'a more specific kind of error')
    .replace(/the codes above/g, 'the kinds above')
    .replace(/\s*[（(][^()（）]*[A-Z]{2,}\.[A-Z_]+[^()（）]*[)）]/g, '');
  // Sentences end at . ! ? followed by a space (not the dot inside GRAM.ORDER)
  const parts = text.split(/([.!?])\s+/);
  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) sentences.push(parts[i] + (parts[i + 1] ?? ''));
  return sentences
    .map((x) => x.trim())
    .filter((x) => x && !CODE.test(x) && !/\bcodes?\b/.test(x) && !/teachers? add/.test(x))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

const CJK_RUN = /[\u3400-\u9fff]+/g;
const PLAIN_WORD = /^[\u3400-\u9fff]{1,6}$/;

/** The fixed words of a word or pattern: "不但……而且……" → 不但, 而且; "正在 + verb" → 正在. */
export function patternPieces(zh: string): string[] {
  return zh.match(CJK_RUN) ?? [];
}

/** The example with each piece taken out, in order; null if a piece isn't there. */
function blanked(example: string, pieces: string[]): PracticePart[] | null {
  const parts: PracticePart[] = [];
  let at = 0;
  for (const p of pieces) {
    const i = example.indexOf(p, at);
    if (i < 0) return null;
    if (i > at) parts.push(example.slice(at, i));
    parts.push({ blank: p });
    at = i + p.length;
  }
  if (at < example.length) parts.push(example.slice(at));
  return parts;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

/** The practice question for a usage block: a choice when there is a word to compare, else fill in, else translate. */
export function practiceFromBlock(b: UsageBlock): PracticeItem | null {
  const ex = b.example;
  if (!ex || !ex.zh.trim()) return null;
  const key = `${b.right?.zh ?? ''}|${ex.zh}`;
  if (b.right) {
    const right = b.right.zh.trim();
    const other = b.compare?.zh.trim() ?? '';
    const at = ex.zh.indexOf(right);
    if (b.compare && PLAIN_WORD.test(right) && PLAIN_WORD.test(other) && !right.includes(other) && !other.includes(right) && at >= 0) {
      return {
        type: 'choice',
        key,
        before: ex.zh.slice(0, at),
        after: ex.zh.slice(at + right.length),
        answer: b.right,
        other: b.compare,
        example: ex,
        otherFirst: (hash(key) & 1) === 1,
      };
    }
    const pieces = patternPieces(right);
    const parts = pieces.length ? blanked(ex.zh, pieces) : null;
    if (parts) return { type: 'fill', key, parts, answer: b.right, example: ex };
  }
  if (ex.en.trim()) return { type: 'translate', key, answer: b.right, example: ex };
  return null;
}

/** One question per usage block with an example (the same example only once). */
export function practiceFrom(usages: string[]): PracticeItem[] {
  const out: PracticeItem[] = [];
  const seen = new Set<string>();
  for (const u of usages) {
    if (!isUsage(u)) continue;
    for (const b of usageBlocks(u)) {
      const q = practiceFromBlock(b);
      if (!q || seen.has(q.example.zh)) continue;
      seen.add(q.example.zh);
      out.push(q);
    }
  }
  return out;
}

/** Whether a typed answer matches (spaces and punctuation don't count). */
export function sameAnswer(typed: string, answer: string): boolean {
  const norm = (x: string) => x.normalize('NFKC').replace(/[\s\p{P}]/gu, '');
  return norm(typed) !== '' && norm(typed) === norm(answer);
}

// ---------------------------------------------------------------------------
// Building the page
// ---------------------------------------------------------------------------

function findRevision(source: PatternSource | undefined, t: ErrorTag): PatternRevision | undefined {
  if (!source) return undefined;
  if (t.revision_id) {
    const r = source.revisions.find((x) => x.id === t.revision_id);
    if (r) return r;
  }
  const o = clean(t.original_text);
  return o ? source.revisions.find((x) => clean(x.original) === o) : undefined;
}

/** What a chip shows for a label: the rule, the words (only the student's own for hints only), or nothing. */
function chipText(t: ErrorTag, kind: PatternSource['kind'] | 'unknown'): string {
  const rule = getRule(t.rule);
  if (rule) return rule.en;
  if (kind === 'corrections') return itemLabel(t);
  return clean(t.item_learner);
}

/**
 * Groups the labels (newest first) into kinds → kinds of error → the
 * student's sentences, with what each correction says about them.
 */
export function buildPatterns(tags: ErrorTag[], sources: Map<string, PatternSource>): StudentPatterns {
  type Fam = {
    sample: ErrorTag;
    tags: ErrorTag[];
  };
  const kinds = new Map<string, Map<string, Fam>>();
  for (const t of tags) {
    if (!isActive(t) || t.nature === 'variant') continue;
    let fams = kinds.get(t.error_type);
    if (!fams) kinds.set(t.error_type, (fams = new Map()));
    const fk = familyKey(t);
    let f = fams.get(fk);
    if (!f) fams.set(fk, (f = { sample: t, tags: [] }));
    f.tags.push(t);
  }

  const groups: PatternGroup[] = [];
  for (const [error_type, fams] of kinds) {
    const families: PatternFamily[] = [];
    for (const [key, f] of fams) {
      const code = getCode(f.sample.code);
      // The student's sentences, in the order of their newest label
      const bySentence = new Map<string, ErrorTag[]>();
      for (const t of f.tags) {
        const rev = findRevision(sources.get(t.submission_id), t);
        const k = `${t.submission_id}|${rev?.id ?? clean(t.original_text)}`;
        const list = bySentence.get(k);
        if (list) list.push(t);
        else bySentence.set(k, [t]);
      }
      const sentences: PatternSentence[] = [];
      const chips = new Map<string, PatternChip>();
      for (const [k, list] of bySentence) {
        const source = sources.get(list[0].submission_id);
        const kind = source?.kind ?? 'unknown';
        const rev = findRevision(source, list[0]);
        const words = [...new Set(list.map((t) => clean(t.item_learner)).filter(Boolean))];
        const missing = list.every((t) => t.operation === 'missing');
        const original = clean(rev?.original) || clean(list[0].original_text);
        if (!original) continue;
        for (const t of list) {
          const text = chipText(t, kind);
          if (!text) continue;
          const c = chips.get(text);
          if (c) c.count++;
          else chips.set(text, { text, count: 1 });
        }
        const marks = rev?.original ? rev.marks : [];
        sentences.push({
          key: k,
          submissionId: list[0].submission_id,
          kind,
          title: source?.title ?? '',
          createdAt: source?.createdAt ?? list[0].created_at,
          original,
          revised: kind === 'corrections' ? rev?.revised || clean(list[0].suggested_revision) || undefined : undefined,
          marks,
          focus: focusMarks(original, marks, words, missing),
          count: list.length,
          why: rev ? relevantPoints(rev.why, words) : kind === 'corrections' ? hintPoints(list[0].explanation) : [],
          usage: rev ? relevantUsage(rev.usage, words) : '',
          status: rev ? source?.statuses?.get(rev.id) : undefined,
          nextDraft: source?.nextDraft,
          unchecked: list.some(isUnconfirmedAi),
        });
      }
      if (sentences.length === 0) continue;
      families.push({
        key,
        name: familyLabel(f.sample),
        zh: code && !code.en.includes(code.zh) ? code.zh : undefined,
        about: code ? studentAbout(code.definition) : clean(f.sample.improvement_tip),
        count: f.tags.length,
        compositions: new Set(f.tags.map((t) => t.submission_id)).size,
        styleOnly: f.tags.every((t) => t.nature === 'infelicity'),
        chips: [...chips.values()].sort((a, b) => b.count - a.count),
        sentences,
        practice: practiceFrom(sentences.map((s) => s.usage)),
        unchecked: f.tags.filter(isUnconfirmedAi).length,
      });
    }
    if (families.length === 0) continue;
    families.sort((a, b) => b.compositions - a.compositions || b.count - a.count);
    groups.push({ error_type: error_type as ErrorType, count: families.reduce((n, f) => n + f.count, 0), families });
  }
  // Kinds in the usual order (Characters, Vocabulary, Grammar, …)
  const order = DOMAINS.map((d) => d.errorType as string);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  groups.sort((a, b) => rank(a.error_type) - rank(b.error_type));

  const focus = groups
    .flatMap((g) => g.families)
    .filter((f) => !f.styleOnly)
    .sort((a, b) => b.compositions - a.compositions || b.count - a.count)
    .slice(0, 3);
  const unchecked = groups.reduce((n, g) => n + g.families.reduce((m, f) => m + f.unchecked, 0), 0);
  return { groups, focus, unchecked };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function revisionsOf(f: StudentFeedback): PatternRevision[] {
  if (f.kind === 'corrections') {
    return withRevisionIds(f.feedback.sentence_revisions as SentenceRevision[] | null).map((r) => ({
      id: r.id,
      original: r.original,
      revised: r.revised,
      marks: r.marks ?? hintMarks(r.original, r.revised),
      why: r.explanation ?? '',
      usage: r.hint ?? '',
    }));
  }
  if (f.kind === 'hints') {
    return f.view.feedback.hints.map((h: HintItem) => ({
      id: h.id,
      original: h.original,
      marks: h.marks ?? [],
      why: h.why ?? '',
      usage: h.hint ?? '',
    }));
  }
  return [];
}

function draftItems(text: string, f: StudentFeedback): DraftItem[] {
  if (f.kind === 'corrections') return itemsFromRevisions(text, f.feedback.sentence_revisions);
  if (f.kind === 'hints') return itemsFromHints(text, f.view.feedback.hints);
  return [];
}

type SubRow = {
  id: string;
  title?: string | null;
  assignment_name?: string | null;
  created_at: string;
  final_text: string;
  first_draft_id?: string | null;
  draft_number?: number | null;
};

/** The signed-in student's error patterns, with the feedback each label came from. */
export async function loadStudentPatterns(supabase: SupabaseClient, studentId: string): Promise<StudentPatterns> {
  const tags = await studentTags(supabase, studentId);
  const ids = [...new Set(tags.map((t) => t.submission_id))];
  if (ids.length === 0) return { groups: [], focus: [], unchecked: 0 };

  const [{ data: subs }, { data: nexts }, feedbacks] = await Promise.all([
    supabase.from('submissions').select('id, title, assignment_name, created_at, final_text').in('id', ids),
    supabase
      .from('submissions')
      .select('id, first_draft_id, draft_number, created_at, final_text')
      .in('first_draft_id', ids)
      .eq('draft_number', 2),
    Promise.all(ids.map((id) => loadStudentFeedback(supabase, id))),
  ]);
  const subById = new Map(((subs ?? []) as SubRow[]).map((s) => [s.id, s]));
  const nextOf = new Map(((nexts ?? []) as SubRow[]).map((s) => [s.first_draft_id as string, s]));
  const nextFeedback = await Promise.all(
    ids.map((id) => (nextOf.has(id) ? loadStudentFeedback(supabase, nextOf.get(id)!.id) : Promise.resolve(null)))
  );

  const sources = new Map<string, PatternSource>();
  ids.forEach((id, i) => {
    const f = feedbacks[i];
    if (f.kind !== 'corrections' && f.kind !== 'hints') return;
    const sub = subById.get(id);
    const source: PatternSource = {
      submissionId: id,
      title: clean(sub?.title) || clean(sub?.assignment_name),
      createdAt: sub?.created_at ?? '',
      kind: f.kind,
      revisions: revisionsOf(f),
    };
    const next = nextOf.get(id);
    const nf = nextFeedback[i];
    if (sub && next && nf && (nf.kind === 'corrections' || nf.kind === 'hints')) {
      source.statuses = draftProgress(sub.final_text, draftItems(sub.final_text, f), next.final_text, draftItems(next.final_text, nf));
      source.nextDraft = draftNumber(next);
    }
    sources.set(id, source);
  });
  return buildPatterns(tags, sources);
}
