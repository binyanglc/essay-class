/**
 * "Hints only" feedback (migration v16): the student sees where each problem
 * is, what kind it is, a hint and usage & examples — never the corrected
 * sentence — and rewrites it themselves.
 *
 * The AI still writes full corrections (the teacher reviews them). On the
 * server we work out *where* each correction changes the student's words
 * ("marks"), and the database (feedback_hints) hands students only those,
 * the explanation ("Hint"), the usage & examples and the comments — never
 * the corrected sentence itself.
 *
 * Pure functions, no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorTag, Feedback, HintKind, HintMark, SentenceRevision } from '@/types';
import { diffChars } from './track-changes';

// ---------------------------------------------------------------------------
// Marks: where the student's words change
// ---------------------------------------------------------------------------

/**
 * The places in `original` that the correction changes. Offsets are within
 * `original`; a mark with start = end means something is missing there.
 * Text that only moves (deleted in one place, inserted in another) becomes
 * one "word order" mark over the whole stretch.
 */
export function hintMarks(original: string, revised: string): HintMark[] {
  if (!original || original === revised) return [];
  const ops = diffChars(original, revised);
  type Group = { start: number; end: number; deleted: string; inserted: string };
  const groups: Group[] = [];
  let pos = 0;
  let cur: Group | null = null;
  for (const op of ops) {
    if (op.type === 'equal') {
      if (cur) groups.push(cur);
      cur = null;
      pos += op.text.length;
      continue;
    }
    if (!cur) cur = { start: pos, end: pos, deleted: '', inserted: '' };
    if (op.type === 'delete') {
      cur.deleted += op.text;
      pos += op.text.length;
      cur.end = pos;
    } else {
      cur.inserted += op.text;
    }
  }
  if (cur) groups.push(cur);
  if (groups.length === 0) return [];

  // Something deleted in one place and inserted in another: word order
  // (two words swapped for each other, 权力 ↔ 权利, are two wrong words, not a move)
  const moved = groups.some(
    (g) =>
      g.deleted.trim() &&
      !g.inserted.trim() &&
      groups.some((h) => h !== g && !h.deleted.trim() && h.inserted.trim() === g.deleted.trim())
  );
  if (moved) {
    const start = Math.min(...groups.map((g) => g.start));
    const end = Math.max(...groups.map((g) => g.end));
    return [{ start, end: Math.max(end, start + 1), kind: 'order' }];
  }

  return groups.map((g) => ({
    start: g.start,
    end: g.end,
    kind: g.deleted && g.inserted ? 'wrong' : g.deleted ? 'extra' : 'missing',
  }));
}

/** Every revision with its marks worked out again (whatever a client sent is ignored). */
export function withMarks<R extends SentenceRevision>(revisions: R[]): R[] {
  return revisions.map((r) => ({ ...r, marks: hintMarks(r.original, r.revised) }));
}

export const HINT_KIND_LABELS: Record<HintKind, string> = {
  missing: 'Missing',
  extra: 'Not needed',
  wrong: 'Wrong',
  order: 'Word order',
};

/** What the marks in one hint are, each kind once, in a fixed order. */
export function kindsOf(marks: HintMark[] | undefined): HintKind[] {
  const order: HintKind[] = ['wrong', 'missing', 'extra', 'order'];
  const set = new Set((marks ?? []).map((m) => m.kind));
  return order.filter((k) => set.has(k));
}

// ---------------------------------------------------------------------------
// What the student is told
// ---------------------------------------------------------------------------
//
// The student sees the AI's explanation (as "Hint") and its usage & examples
// as they are: nothing is taken out. The teacher's decision (2026-10-16): in
// "hints only" the student still has to rewrite the sentence, so a specific
// hint teaches more than it gives away; checking for the corrected sentence
// took out the most useful explanations. The AI is still asked not to write
// the corrected sentence, and the teacher can edit everything before release.

const FALLBACK: Record<HintKind, string> = {
  missing: 'Something is missing at the marked place.',
  extra: "The marked part isn't needed here.",
  wrong: "The marked part isn't right here.",
  order: 'Look again at the word order here.',
};

/** A plain hint about the kind of problem, for when the AI wrote neither an explanation nor a hint. */
export function fallbackHint(marks: HintMark[] | undefined): string {
  return FALLBACK[kindsOf(marks)[0] ?? 'wrong'];
}

/** Longest hint kept (all problems together). */
export const MAX_HINT = 3000;

/** Numbers and bullets at the start of a point: "(1)", "（1）", "1.", "①", "•", "-". */
const POINT_NUMBER = /^\s*(?:[(（]\d{1,2}[)）]|\d{1,2}[.)、．]|[①-⑳]|[•·*\-–—])\s*/;

/**
 * Where a new point starts after a semicolon: "…; 怀处 vs 坏处: …", "…; Before 之前: …"
 * (but not "…; 严格 means strict", the second half of a contrast).
 */
const NEXT_POINT =
  /\s*[;；]\s*(?=(?:(?:Before|After|Between)\s+)?[^\s;；:：]{1,12}(?:\s*(?:vs\.?|\/|or)\s*[^\s;；:：]{1,12})?\s*[:：])/i;

/**
 * A hint's points — one per problem, one per line — without numbers, bullets
 * or markdown bold. Points written on one line are split too: numbered
 * "(1) … (2) …", or "X: …; Y: …".
 */
export function hintPoints(hint: string | readonly string[] | null | undefined): string[] {
  const text = Array.isArray(hint) ? hint.filter((h) => typeof h === 'string').join('\n') : typeof hint === 'string' ? hint : '';
  return text
    .replace(/\\n/g, '\n') // a line break the model escaped twice
    .replace(/\*\*|__/g, '')
    .split(/\r?\n+/)
    .flatMap((line) =>
      /^\s*(?:[(（]1[)）]|①)/.test(line) ? line.split(/\s*(?=[(（](?:[2-9]|1\d)[)）]|[②-⑳])/) : [line]
    )
    .flatMap((line) => line.split(NEXT_POINT))
    .map((p) => p.replace(POINT_NUMBER, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// "Usage & examples" (the hint, from v19): for each problem, the right word or
// pattern, a word to compare it with, phrases and an example sentence — each
// with pinyin and English. Stored as plain text the teacher can edit:
//
//   表示的看法:
//   → 同意 (tóngyì) — to agree
//   vs 表示 (biǎoshì) — to express, to show
//   • 同意……的看法 (tóngyì … de kànfǎ) — agree with …'s view
//   Example: 我同意老师的看法。(Wǒ tóngyì lǎoshī de kànfǎ.) — I agree with the teacher's view.
//
// One block per problem, blocks separated by an empty line. Older hints (one
// line per problem) are shown as before.
// ---------------------------------------------------------------------------

/** A Chinese word, phrase or sentence with its pinyin and English. */
export interface UsageEntry {
  zh: string;
  pinyin: string;
  en: string;
}

/** Usage & examples for one problem. */
export interface UsageBlock {
  /** The student's words it is about ("表示的看法", "Before 跑步"). */
  about: string;
  right: UsageEntry | null;
  compare: UsageEntry | null;
  phrases: UsageEntry[];
  example: UsageEntry | null;
  /** Lines in no known shape (a teacher's own note): shown as they are. */
  other: string[];
}

const oneLine = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function toEntry(v: unknown): UsageEntry | null {
  if (typeof v === 'string') return oneLine(v) ? { zh: oneLine(v), pinyin: '', en: '' } : null;
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const zh = oneLine(o.zh);
  if (!zh) return null;
  return { zh, pinyin: oneLine(o.pinyin).replace(/^\(|\)$/g, ''), en: oneLine(o.en) };
}

/** "同意 (tóngyì) — to agree" */
export function entryText(e: UsageEntry): string {
  return `${e.zh}${e.pinyin ? ` (${e.pinyin})` : ''}${e.en ? ` — ${e.en}` : ''}`;
}

/** "同意 (tóngyì) — to agree" → its parts (what doesn't fit the shape is all Chinese). */
export function parseEntry(line: string): UsageEntry {
  const t = line.trim();
  const full = t.match(/^(.*?)\s*[(（]([^()（）]*)[)）]\s+[—–-]\s+(.+)$/);
  if (full && full[1]) return { zh: full[1].trim(), pinyin: full[2].trim(), en: full[3].trim() };
  const noPinyin = t.match(/^(.*?)\s+[—–-]\s+(.+)$/);
  if (noPinyin && noPinyin[1]) return { zh: noPinyin[1].trim(), pinyin: '', en: noPinyin[2].trim() };
  const noEn = t.match(/^(.*?)\s*[(（]([^()（）]*)[)）]$/);
  if (noEn && noEn[1]) return { zh: noEn[1].trim(), pinyin: noEn[2].trim(), en: '' };
  return { zh: t, pinyin: '', en: '' };
}

/** The AI's usage & examples (one object per problem) as the text that is saved. */
export function formatUsage(items: readonly unknown[]): string {
  const blocks: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      if (item.trim()) blocks.push(item.trim());
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const right = toEntry(o.right);
    const compare = toEntry(o.compare);
    const phrases = (Array.isArray(o.phrases) ? o.phrases : []).map(toEntry).filter((e): e is UsageEntry => !!e).slice(0, 4);
    const example = toEntry(o.example);
    if (!right && !phrases.length && !example) continue;
    const about = oneLine(o.student_words, 40).replace(/[:：]$/, '');
    blocks.push(
      [
        about && `${about}:`,
        right && `→ ${entryText(right)}`,
        compare && `vs ${entryText(compare)}`,
        ...phrases.map((p) => `• ${entryText(p)}`),
        example && `Example: ${entryText(example)}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return blocks.join('\n\n');
}

const USAGE_LINE = /^\s*(?:→|vs\s|•\s|Example:)/im;

/** Whether a hint is "usage & examples" (from v19) rather than the older one line per problem. */
export function isUsage(text: string | null | undefined): boolean {
  return !!text && USAGE_LINE.test(text);
}

/** Usage & examples text → one block per problem, for display. */
export function usageBlocks(text: string): UsageBlock[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => {
      const block: UsageBlock = { about: '', right: null, compare: null, phrases: [], example: null, other: [] };
      chunk
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((line, i) => {
          let m: RegExpMatchArray | null;
          if ((m = line.match(/^→\s*(.+)$/))) block.right = parseEntry(m[1]);
          else if ((m = line.match(/^vs\.?\s+(.+)$/i))) block.compare = parseEntry(m[1]);
          else if ((m = line.match(/^[•·\-*]\s*(.+)$/))) block.phrases.push(parseEntry(m[1]));
          else if ((m = line.match(/^(?:Example|e\.g\.|例)[:：]?\s*(.+)$/i))) block.example = parseEntry(m[1]);
          else if (i === 0 && /[:：]$/.test(line)) block.about = line.replace(/[:：]$/, '');
          else block.other.push(line);
        });
      return block;
    })
    .filter((b) => b.right || b.compare || b.phrases.length || b.example || b.other.length);
}

/** A hint as it is saved: usage & examples cut to whole blocks, an older-style hint to whole points. */
export function tidyHint(hint: string | null | undefined): string {
  const text = (hint ?? '').trim();
  if (!text) return '';
  const parts = isUsage(text) ? text.split(/\n\s*\n/).map((b) => b.trim()) : hintPoints(text);
  const out: string[] = [];
  let length = 0;
  for (const part of parts) {
    if (!part || length + part.length > MAX_HINT) break;
    out.push(part);
    length += part.length + 2;
  }
  return out.join(isUsage(text) ? '\n\n' : '\n');
}

/** Prepares the AI's corrections for a "corrections" assignment: marks, and usage & examples tidied. */
export function prepareCorrections<R extends SentenceRevision>(revisions: R[]): R[] {
  return withMarks(revisions).map((r) => ({ ...r, hint: tidyHint(r.hint) || undefined }));
}

/**
 * Prepares the AI's corrections for a "hints only" assignment: where each
 * problem is (marks), the explanation shared with the student, and the usage
 * & examples. With neither, a plain hint about the kind of problem.
 */
export function prepareHintFeedback<R extends SentenceRevision>(revisions: R[]): R[] {
  return withMarks(revisions).map((r) => {
    const explanation = (r.explanation ?? '').trim();
    const hint = tidyHint(r.hint);
    return { ...r, explanation, hint: hint || (explanation ? '' : fallbackHint(r.marks)), whyShared: true };
  });
}

// ---------------------------------------------------------------------------
// What the student gets (from the database function feedback_hints)
// ---------------------------------------------------------------------------

/** One problem, as the student sees it: never the corrected sentence. */
export interface HintItem {
  id: string;
  /** The student's words; missing when the correction wasn't found in the composition. */
  original: string | null;
  start?: number;
  end?: number;
  source?: 'ai' | 'teacher';
  commentKey?: string;
  hint?: string;
  /** Why it is wrong (the explanation), when the student may see it (migration v19). */
  why?: string;
  marks?: HintMark[];
}

/** Feedback as the student gets it in a "hints only" assignment. */
export type HintFeedback = Omit<Feedback, 'sentence_revisions' | 'strengths' | 'main_problems' | 'repeated_error_summary' | 'next_step_advice'> & {
  hints: HintItem[];
};

/** A label without the right answer (no words, explanation or corrected sentence). */
export type HintTag = Pick<ErrorTag, 'id' | 'submission_id' | 'student_id' | 'error_type' | 'original_text' | 'created_at'> &
  Pick<ErrorTag, 'code' | 'rule' | 'grammar_point' | 'nature' | 'severity' | 'operation' | 'source' | 'status' | 'revision_id'>;

export interface HintView {
  feedback: HintFeedback;
  tags: HintTag[];
}

/**
 * "Hints only" feedback for this composition, as the database hands it out
 * (feedback_hints, migration v16): to its student once released, and to the
 * class teacher. Null for anyone else, for "corrections" feedback, or if it
 * can't be loaded.
 */
export async function fetchHintView(supabase: SupabaseClient, submissionId: string): Promise<HintView | null> {
  const { data, error } = await supabase.rpc('feedback_hints', { p_submission_id: submissionId });
  if (error || !data || typeof data !== 'object') return null;
  const v = data as Partial<HintView>;
  if (!v.feedback || !Array.isArray(v.feedback.hints)) return null;
  return { feedback: v.feedback, tags: Array.isArray(v.tags) ? v.tags : [] };
}

/** Comment thread key for a hint (the same as for its correction, so teacher and student share it). */
export function hintCommentKey(h: Pick<HintItem, 'id' | 'commentKey'>): string {
  return h.commentKey ?? `sentence_${h.id}`;
}

export interface PlacedHint {
  hint: HintItem;
  /** [start, end) of the hint's sentence in the composition. */
  start: number;
  end: number;
}

/**
 * Finds each hint's sentence in the composition (by its saved offsets, else by
 * searching), in reading order. Hints whose sentence can't be found are
 * returned separately.
 */
export function placeHints(text: string, hints: HintItem[]): { placed: PlacedHint[]; unplaced: HintItem[] } {
  const placed: PlacedHint[] = [];
  const unplaced: HintItem[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  for (const h of hints) {
    let start = -1;
    if (!h.original) {
      unplaced.push(h);
      continue;
    }
    if (
      Number.isInteger(h.start) &&
      Number.isInteger(h.end) &&
      text.slice(h.start!, h.end!) === h.original &&
      free(h.start!, h.end!)
    ) {
      start = h.start!;
    } else if (h.original) {
      let from = 0;
      for (;;) {
        const i = text.indexOf(h.original, from);
        if (i < 0) break;
        if (free(i, i + h.original.length)) {
          start = i;
          break;
        }
        from = i + 1;
      }
    }
    if (start < 0) {
      unplaced.push(h);
      continue;
    }
    const end = start + h.original.length;
    taken.push([start, end]);
    placed.push({ hint: h, start, end });
  }
  placed.sort((a, b) => a.start - b.start);
  return { placed, unplaced };
}

export type HintSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'mark'; text: string; mark: HintKind; hintId: string; n: number; last: boolean };

/**
 * The composition cut into plain text and marked pieces, for display. `n` is
 * the hint's number; `last` marks the hint's last piece (where its number goes).
 */
export function hintSegments(text: string, placed: PlacedHint[], numbers: Map<string, number>): HintSegment[] {
  const out: HintSegment[] = [];
  let pos = 0;
  for (const p of placed) {
    if (p.start > pos) out.push({ kind: 'plain', text: text.slice(pos, p.start) });
    const words = p.hint.original ?? '';
    const marks = [...(p.hint.marks ?? [])]
      .filter((m) => m.start >= 0 && m.end <= p.end - p.start && m.start <= m.end)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const n = numbers.get(p.hint.id) ?? 0;
    const pieces: HintSegment[] = [];
    let at = 0;
    // No marks (e.g. an older correction): mark the whole sentence
    const list = marks.length ? marks : [{ start: 0, end: p.end - p.start, kind: 'wrong' as HintKind }];
    for (const m of list) {
      if (m.start < at) continue;
      if (m.start > at) pieces.push({ kind: 'plain', text: words.slice(at, m.start) });
      pieces.push({ kind: 'mark', text: words.slice(m.start, m.end), mark: m.kind, hintId: p.hint.id, n, last: false });
      at = m.end;
    }
    if (at < words.length) pieces.push({ kind: 'plain', text: words.slice(at) });
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      if (piece.kind === 'mark') {
        pieces[i] = { ...piece, last: true };
        break;
      }
    }
    out.push(...pieces);
    pos = p.end;
  }
  if (pos < text.length) out.push({ kind: 'plain', text: text.slice(pos) });
  return out;
}
