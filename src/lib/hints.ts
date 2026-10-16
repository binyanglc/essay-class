/**
 * "Hints only" feedback (migration v16): the student sees where each problem
 * is, what kind it is and a short hint — never the corrected sentence.
 *
 * The AI still writes full corrections (the teacher reviews them). On the
 * server we work out *where* each correction changes the student's words
 * ("marks"), make sure the AI's hints and comments never show a corrected
 * sentence (they may name the right word or pattern), and the database
 * (feedback_hints) hands students only the safe parts.
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
// Keeping the corrected sentence out of hints and comments
// ---------------------------------------------------------------------------
//
// A hint may name the right word, character or pattern — "严厉 vs 严格: …",
// "不但 A，而且 B", "正在 + verb" — because that is what the student needs to
// learn (the teacher asked for hints specific enough to act on). What it must
// not do is show the student's own sentence corrected: the right words put
// back among the student's other words ("控制越来越严格", "正在成长"). Putting
// them together is the student's job.

/** Characters of the corrected sentence that, joining a change to the student's own words, show it corrected. */
const WINDOW = 4;
/** This many new characters in a row are a corrected phrase, not a word to learn. */
const NEW_PHRASE = 6;

/** Spaces, punctuation and symbols: left out when comparing, so "越来越**严格**" or "很累了, 我想" still count. */
const SEPARATOR = /[\s\p{P}\p{S}]/u;
const SEPARATORS = /[\s\p{P}\p{S}]+/gu;
/** Glosses in brackets without Chinese ("(yángé)", "(strict)") and pinyin with tone marks ("yángé"). */
const GLOSS = /[(（][^()（）\u3400-\u9fff]*[)）]/g;
// (no lookbehind: this file also runs in students' browsers, and older Safari can't parse one)
const PINYIN_WORD = /(^|[^A-Za-z\u00C0-\u024F])[A-Za-z\u00C0-\u024F]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ][A-Za-z\u00C0-\u024F]*/g;

/** A hint or comment as it is compared with corrected stretches: only its words, no separators or pinyin. */
function compareForm(text: string): string {
  return text.replace(GLOSS, ' ').replace(PINYIN_WORD, '$1 ').replace(SEPARATORS, '');
}

/**
 * The stretches of the corrected sentence that would show the answer in place
 * (spaces and punctuation left out): every WINDOW characters that join
 * something the correction changed (new text, or a place where text was taken
 * out) to the student's own words, and every NEW_PHRASE characters of new
 * text — unless the student wrote that stretch themselves (`own`, by default
 * the original sentence).
 */
export function correctedStretches(original: string, revised: string, own: string = original): string[] {
  if (!original || original === revised) return [];
  // Each character of `revised` that counts: new or the student's, and whether something changed just before it
  const chars: string[] = [];
  const isNew: boolean[] = [];
  const cutBefore: boolean[] = [];
  let cut = false;
  for (const op of diffChars(original, revised)) {
    if (op.type === 'delete') {
      cut = true;
      continue;
    }
    for (const ch of op.text) {
      if (SEPARATOR.test(ch)) {
        if (op.type === 'insert') cut = true; // added punctuation is a change between the characters around it
        continue;
      }
      chars.push(ch);
      isNew.push(op.type === 'insert');
      cutBefore.push(cut);
      cut = false;
    }
  }
  const ownWords = own.replace(SEPARATORS, '');
  const out = new Set<string>();
  const add = (s: number, e: number) => {
    const w = chars.slice(s, e).join('');
    if (!ownWords.includes(w)) out.add(w);
  };
  const n = chars.length;
  for (let s = 0; s + WINDOW <= n; s++) {
    let changed = false;
    let student = false;
    for (let i = s; i < s + WINDOW; i++) {
      if (isNew[i]) changed = true;
      else student = true;
      if (i > s && cutBefore[i]) changed = true;
    }
    if (changed && student) add(s, s + WINDOW);
  }
  for (let s = 0; s + NEW_PHRASE <= n; s++) {
    if (isNew.slice(s, s + NEW_PHRASE).every(Boolean)) add(s, s + NEW_PHRASE);
  }
  return [...out];
}

/** Whether `text` shows any of `stretches`, whatever is put between the characters (spaces, quotes, "+", pinyin…). */
function showsAny(text: string, stretches: string[]): boolean {
  if (!stretches.length) return false;
  const words = compareForm(text);
  return stretches.some((w) => words.includes(w));
}

const FALLBACK: Record<HintKind, string> = {
  missing: 'Something is missing at the marked place.',
  extra: "The marked part isn't needed here.",
  wrong: "The marked part isn't right here.",
  order: 'Look again at the word order here.',
};

/** A hint that says nothing about the answer, for when every point of the AI's hint gave it away. */
export function fallbackHint(marks: HintMark[] | undefined): string {
  return FALLBACK[kindsOf(marks)[0] ?? 'wrong'];
}

/** Longest hint kept (all points together), and longest single point. */
export const MAX_HINT = 800;
const MAX_POINT = 300;

/** Numbers and bullets at the start of a point: "(1)", "（1）", "1.", "①", "•", "-". */
const POINT_NUMBER = /^\s*(?:[(（]\d{1,2}[)）]|\d{1,2}[.)、．]|[①-⑳]|[•·*\-–—])\s*/;

/**
 * A hint's points — one per problem, one per line — without numbers, bullets
 * or markdown bold. A numbered "(1) … (2) …" written on one line is split too.
 */
export function hintPoints(hint: string | null | undefined): string[] {
  return (hint ?? '')
    .replace(/\\n/g, '\n') // a line break the model escaped twice
    .replace(/\*\*|__/g, '')
    .split(/\r?\n+/)
    .flatMap((line) =>
      /^\s*(?:[(（]1[)）]|①)/.test(line) ? line.split(/\s*(?=[(（](?:[2-9]|1\d)[)）]|[②-⑳])/) : [line]
    )
    .map((p) => p.replace(POINT_NUMBER, '').trim())
    .filter(Boolean);
}

/** A point cut to MAX_POINT characters, at the end of a sentence if there is one. */
function clipPoint(point: string): string {
  if (point.length <= MAX_POINT) return point;
  const head = point.slice(0, MAX_POINT);
  const end = Math.max(...['. ', '; ', '。', '；'].map((m) => head.lastIndexOf(m)));
  return end > MAX_POINT / 3 ? head.slice(0, end + 1).trim() : `${head.slice(0, MAX_POINT - 1).trim()}…`;
}

/** Whether a hint (or one point of it) shows this sentence corrected. */
export function hintGivesAnswer(rev: Pick<SentenceRevision, 'original' | 'revised'>, hint: string): boolean {
  return showsAny(hint, correctedStretches(rev.original, rev.revised));
}

/**
 * The AI's hint with any point that shows the sentence corrected taken out
 * (or, with `others`, another corrected sentence), one point per line. If
 * nothing is left, a plain hint about the kind of problem.
 */
export function safeHint(
  rev: Pick<SentenceRevision, 'original' | 'revised' | 'hint' | 'marks'>,
  others: string[] = []
): string {
  const points = hintPoints(rev.hint);
  if (!points.length) return '';
  const stretches = [...correctedStretches(rev.original, rev.revised), ...others];
  const kept: string[] = [];
  let length = 0;
  for (const p of points) {
    if (showsAny(p, stretches)) continue;
    const point = clipPoint(p);
    if (length + point.length > MAX_HINT) break;
    kept.push(point);
    length += point.length + 1;
  }
  return kept.length ? kept.join('\n') : fallbackHint(rev.marks);
}

/**
 * What would show corrected sentences in a comment (or in another sentence's
 * hint): the stretches of every corrected sentence that the student didn't
 * write anywhere in the composition.
 */
export function commentLeaks(text: string, revisions: Pick<SentenceRevision, 'original' | 'revised'>[]): string[] {
  const out = new Set<string>();
  for (const r of revisions) for (const w of correctedStretches(r.original, r.revised, text)) out.add(w);
  return [...out];
}

// A list of corrections rather than an explanation: "Replace 要 with 希望", "'的' should be '得'",
// "完 → 结束", "改成…". Explaining a word or a rule ("Use 严格 for rules", "昨天 should be placed
// before the verb") is fine.
const CORRECTION_WORDING = [
  /[\u3400-\u9fff][^\u3400-\u9fff]{0,8}(?:→|->|=>|⇒)[^\u3400-\u9fff]{0,8}[\u3400-\u9fff]/,
  /\b(?:chang|replac|correct|rewrit|fix)\w*\b[^.!?。！？]*?[\u3400-\u9fff][^.!?。！？]*?\b(?:to|with|into|as)\b[^\u3400-\u9fff.!?。！？]{0,8}[\u3400-\u9fff]/i,
  /[\u3400-\u9fff][^\u3400-\u9fff]{0,6}\bshould (?:be|read)\b[^\u3400-\u9fff]{0,6}[\u3400-\u9fff]/i,
  /(?:改成|改为|换成|应该是|应为|应改)[^\u3400-\u9fff]{0,4}[\u3400-\u9fff]/,
];
// A sentence, with the closing quote or bracket after its full stop ("… such as '严格.' Next …")
const SENTENCE = /[^.!?。！？]+[.!?。！？]*(?:[’”」』）)]|['"](?=[\s)）]|$))*\s*/g;

/** Drops the sentences of a comment that show any of `leaks`, or that list a correction. */
export function scrubComment(comment: string, leaks: string[]): string {
  if (!comment) return comment;
  const sentences = comment.match(SENTENCE) ?? [comment];
  return sentences
    .filter((s) => !showsAny(s, leaks) && !CORRECTION_WORDING.some((re) => re.test(s)))
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
 * Prepares the AI's feedback for a "hints only" assignment: hints and
 * comments without anything that shows a corrected sentence.
 */
export function prepareHintFeedback<C extends Partial<Record<CommentField, string>>, R extends SentenceRevision>(
  text: string,
  comments: C,
  revisions: R[]
): { comments: C; revisions: R[] } {
  const marked = withMarks(revisions);
  const leaks = commentLeaks(text, marked);
  const cleanComments = { ...comments };
  for (const f of COMMENT_FIELDS) {
    const v = comments[f];
    if (typeof v === 'string') (cleanComments as Record<string, string>)[f] = scrubComment(v, leaks);
  }
  // A hint may not show its own sentence corrected, nor any other (the student sees them all)
  return { comments: cleanComments, revisions: marked.map((r) => ({ ...r, hint: safeHint(r, leaks) })) };
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
