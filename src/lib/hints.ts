/**
 * "Hints only" feedback (migration v16): the student sees where each problem
 * is, what kind it is and a short hint — never the corrected sentence.
 *
 * The AI still writes full corrections (the teacher reviews them). On the
 * server we work out *where* each correction changes the student's words
 * ("marks"), make sure the AI's hints and comments don't give the answer
 * away, and the database (feedback_hints) hands students only the safe parts.
 *
 * Pure functions, no React.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { pinyin } from 'pinyin-pro';
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
  const moved = groups.some(
    (g) => g.deleted.trim() && groups.some((h) => h !== g && h.inserted.trim() === g.deleted.trim())
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
// Keeping the answer out of hints and comments
// ---------------------------------------------------------------------------

const ASCII_WORD = /[A-Za-z0-9\s]/;

/** What the correction takes out and puts in (each run of changed text). */
function changedText(original: string, revised: string): { deleted: string[]; inserted: string[] } {
  const deleted: string[] = [];
  const inserted: string[] = [];
  for (const op of diffChars(original, revised)) {
    if (op.type === 'delete') deleted.push(op.text);
    else if (op.type === 'insert') inserted.push(op.text);
  }
  return { deleted, inserted };
}

/**
 * Characters the correction puts in, except ones it also takes out (the
 * student's own words may be quoted). Even if the student wrote the same
 * character elsewhere in the sentence, naming it would point to the answer.
 */
function newCharacters(original: string, revised: string): string[] {
  const { deleted, inserted } = changedText(original, revised);
  const removed = new Set([...deleted.join('')]);
  const out = new Set<string>();
  for (const ch of inserted.join('')) if (!ASCII_WORD.test(ch) && !removed.has(ch)) out.add(ch);
  return [...out];
}

/**
 * Pinyin of the words the correction puts in: every stretch of 2–4 added
 * characters (就要结束 → "jieshu", "jie shu", "jiuyao", …). Single syllables
 * are left out ("de" names the three 的/地/得, not the answer).
 */
function insertedPinyin(original: string, revised: string): string[] {
  const out = new Set<string>();
  for (const run of changedText(original, revised).inserted) {
    const han = run.replace(/[^\u3400-\u9fff]/g, '');
    if (han.length < 2) continue;
    const syllables = pinyin(han, { toneType: 'none', type: 'array' }) as string[];
    for (let i = 0; i < syllables.length; i++) {
      for (let n = 2; n <= 4 && i + n <= syllables.length; n++) {
        const part = syllables.slice(i, i + n);
        out.add(part.join(''));
        out.add(part.join(' '));
      }
    }
  }
  return [...out];
}

const FALLBACK: Record<HintKind, string> = {
  missing: 'Something is missing at the marked place.',
  extra: "The marked part isn't needed here.",
  wrong: "The marked part isn't right here.",
  order: 'Look again at the word order here.',
};

/** A hint that says nothing about the answer, for when the AI's hint gave it away. */
export function fallbackHint(marks: HintMark[] | undefined): string {
  return FALLBACK[kindsOf(marks)[0] ?? 'wrong'];
}

/** Whether a hint gives the answer to this correction away. */
export function hintGivesAnswer(rev: Pick<SentenceRevision, 'original' | 'revised' | 'marks'>, hint: string): boolean {
  const revised = rev.revised.trim();
  if (revised && hint.includes(revised)) return true;
  // Any character the correction puts in
  if (newCharacters(rev.original, rev.revised).some((ch) => hint.includes(ch))) return true;
  // Word order: naming the words that move says where they go
  if (kindsOf(rev.marks).includes('order')) {
    const moved = changedText(rev.original, rev.revised).deleted.map((t) => t.trim()).filter(Boolean);
    if (moved.some((t) => hint.includes(t))) return true;
  }
  // The new word in pinyin
  const lower = hint.toLowerCase();
  return insertedPinyin(rev.original, rev.revised).some((py) => lower.includes(py));
}

/**
 * The AI's hint, unless it gives the answer away — then a plain hint about
 * the kind of problem.
 */
export function safeHint(rev: Pick<SentenceRevision, 'original' | 'revised' | 'hint' | 'marks'>): string {
  const hint = (rev.hint ?? '').trim();
  if (!hint) return '';
  if (hintGivesAnswer(rev, hint)) return fallbackHint(rev.marks);
  return hint.slice(0, 300);
}

/**
 * What would give answers away in a comment: characters the corrections put
 * in that the student never wrote, and every word (2+ characters) they put in.
 */
export function answerCharacters(text: string, revisions: Pick<SentenceRevision, 'original' | 'revised'>[]): string[] {
  const out = new Set<string>();
  for (const r of revisions) {
    for (const ch of newCharacters(r.original, r.revised)) if (!text.includes(ch)) out.add(ch);
    for (const run of changedText(r.original, r.revised).inserted) {
      const t = run.trim();
      if ([...t].filter((c) => !ASCII_WORD.test(c)).length >= 2) out.add(t);
    }
  }
  return [...out];
}

// "Replace 要 with 希望", "should be 得", "→ 结束", "改成…": a correction, whatever the words
const CORRECTION_WORDING =
  /(instead of|should (?:be|use|say|write)|replac|change[sd]?\b.*\bto\b|\buse\b(?! of)|try using|→|->|改成|改为|应该|换成)/i;
const HAN = /[\u3400-\u9fff]/;

/** Drops the sentences of a comment that mention any of `leaks`, or that word a correction with Chinese in it. */
export function scrubComment(comment: string, leaks: string[]): string {
  if (!comment) return comment;
  const sentences = comment.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [comment];
  return sentences
    .filter((s) => !leaks.some((ch) => s.includes(ch)) && !(CORRECTION_WORDING.test(s) && HAN.test(s)))
    .join('')
    .trim();
}

const COMMENT_FIELDS = [
  'overall_comment',
  'characters_comment',
  'vocabulary_comment',
  'grammar_comment',
  'content_feedback',
  'structure_feedback',
] as const;
type CommentField = (typeof COMMENT_FIELDS)[number];

/**
 * Prepares the AI's feedback for a "hints only" assignment: safe hints, and
 * comments without the sentences that would give an answer away.
 */
export function prepareHintFeedback<C extends Partial<Record<CommentField, string>>, R extends SentenceRevision>(
  text: string,
  comments: C,
  revisions: R[]
): { comments: C; revisions: R[] } {
  const marked = withMarks(revisions);
  const leaks = answerCharacters(text, marked);
  const cleanComments = { ...comments };
  for (const f of COMMENT_FIELDS) {
    const v = comments[f];
    if (typeof v === 'string') (cleanComments as Record<string, string>)[f] = scrubComment(v, leaks);
  }
  return { comments: cleanComments, revisions: marked.map((r) => ({ ...r, hint: safeHint(r) })) };
}

// ---------------------------------------------------------------------------
// What the student gets (from the database function feedback_hints)
// ---------------------------------------------------------------------------

/** One problem, as the student sees it: no corrected sentence, no explanation. */
export interface HintItem {
  id: string;
  /** The student's words; missing when the correction wasn't found in the composition. */
  original: string | null;
  start?: number;
  end?: number;
  source?: 'ai' | 'teacher';
  commentKey?: string;
  hint?: string;
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
