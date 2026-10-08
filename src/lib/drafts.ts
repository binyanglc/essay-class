/**
 * Drafts (migration v17): after seeing the feedback a student revises the
 * same composition and submits it again. Here: what changed between two
 * drafts, and for each problem the last draft had, whether the student fixed
 * it — worked out by comparing the drafts, no AI needed:
 *
 *   fixed      the student changed it, and the new draft's feedback doesn't
 *              correct it any more (even if it's not the AI's wording)
 *   still      the student changed it, but the new feedback still corrects it
 *   unchanged  the student didn't change it
 *
 * Pure functions, no React.
 */

import type { DiffOp } from './track-changes';
import { diffChars, placeRevisions, splitSentences } from './track-changes';
import { withRevisionIds } from './revisions';
import { placeHints } from './hints';
import type { HintItem } from './hints';
import type { HintMark, SentenceRevision, Submission } from '@/types';

export type DraftStatus = 'fixed' | 'still' | 'unchanged';

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  fixed: 'Fixed',
  still: 'Still needs work',
  unchanged: 'Not changed yet',
};

/** A problem's place in a draft: [start, end) of the student's words. */
export interface DraftSpan {
  id: string;
  start: number;
  end: number;
}

function pieces(text: string): string[] {
  return splitSentences(text).map((p) => text.slice(p.start, p.end));
}

/** Clauses (split after ，、；：), for long stretches with no sentence in common. */
function clauses(text: string): string[] {
  return text.match(/[^，,、；;：:]+[，,、；;：:]*|[，,、；;：:]+/g) ?? (text ? [text] : []);
}

/** Longest common subsequence of two lists of strings: pairs of matching indexes. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

function push(ops: DiffOp[], type: DiffOp['type'], text: string) {
  if (!text) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.text += text;
  else ops.push({ type, text });
}

/**
 * What changed from one draft to the next: sentences the student kept are
 * matched whole, and the stretches between them are compared character by
 * character (so long compositions stay fast and readable).
 */
export function draftDiff(prev: string, next: string): DiffOp[] {
  if (prev === next) return prev ? [{ type: 'equal', text: prev }] : [];
  const a = pieces(prev);
  const b = pieces(next);
  const pairs = lcsPairs(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  const gap = (ai: number, bj: number) => gapDiff(ops, a.slice(i, ai).join(''), b.slice(j, bj).join(''));
  for (const [ai, bj] of pairs) {
    gap(ai, bj);
    push(ops, 'equal', a[ai]);
    i = ai + 1;
    j = bj + 1;
  }
  gap(a.length, b.length);
  return ops;
}

/**
 * Changed stretch between matching sentences: character by character, or —
 * when it is too long for that — clause by clause first, so unchanged
 * clauses still match.
 */
function gapDiff(ops: DiffOp[], from: string, to: string) {
  if (!from || !to || from.length * to.length <= 250_000) {
    for (const op of diffChars(from, to)) push(ops, op.type, op.text);
    return;
  }
  const a = clauses(from);
  const b = clauses(to);
  const pairs = lcsPairs(a, b);
  let i = 0;
  let j = 0;
  const sub = (ai: number, bj: number) => {
    const x = a.slice(i, ai).join('');
    const y = b.slice(j, bj).join('');
    if (x.length * y.length <= 250_000) for (const op of diffChars(x, y)) push(ops, op.type, op.text);
    else {
      push(ops, 'delete', x);
      push(ops, 'insert', y);
    }
  };
  for (const [ai, bj] of pairs) {
    sub(ai, bj);
    push(ops, 'equal', a[ai]);
    i = ai + 1;
    j = bj + 1;
  }
  sub(a.length, b.length);
}

/** Where a position in the old draft ends up in the new one (inside deleted text: where it was). */
export function mapPosition(ops: DiffOp[], pos: number): number {
  let a = 0;
  let b = 0;
  for (const op of ops) {
    if (op.type === 'insert') {
      b += op.text.length;
      continue;
    }
    const len = op.text.length;
    if (pos < a + len) return op.type === 'equal' ? b + (pos - a) : b;
    a += len;
    if (op.type === 'equal') b += len;
  }
  return b;
}

/**
 * Whether the student changed anything inside [start, end) of the old draft.
 * Text added right before or after it (e.g. a new sentence) doesn't count.
 */
function changedWithin(ops: DiffOp[], start: number, end: number): boolean {
  let a = 0;
  for (const op of ops) {
    if (a > end) break;
    if (op.type === 'insert') {
      if (a > start && a < end) return true;
      continue;
    }
    const len = op.text.length;
    if (op.type === 'delete' && a < end && a + len > start) return true;
    a += len;
  }
  return false;
}

/**
 * For each problem in the last draft: fixed, still needs work, or not changed
 * (see the top of this file). `nextSpans` are the problems the new draft's
 * feedback marks.
 */
export function draftProgress(
  prevText: string,
  prevSpans: DraftSpan[],
  nextText: string,
  nextSpans: Pick<DraftSpan, 'start' | 'end'>[]
): Map<string, DraftStatus> {
  const ops = draftDiff(prevText, nextText);
  const out = new Map<string, DraftStatus>();
  for (const s of prevSpans) {
    const words = prevText.slice(s.start, s.end);
    // Untouched, or moved somewhere else word for word
    if (!changedWithin(ops, s.start, s.end) || (words.trim().length >= 2 && nextText.includes(words))) {
      out.set(s.id, 'unchanged');
      continue;
    }
    let ns = mapPosition(ops, s.start);
    let ne = Math.max(ns, mapPosition(ops, s.end));
    // All of it was replaced: look at what was written in its place
    if (ne === ns) [ns, ne] = insertedAt(ops, ns);
    const stillMarked = ne > ns && nextSpans.some((n) => n.start < ne && n.end > ns);
    out.set(s.id, stillMarked ? 'still' : 'fixed');
  }
  return out;
}

/** The text inserted right at position `pos` of the new draft (before or after it), as [start, end). */
function insertedAt(ops: DiffOp[], pos: number): [number, number] {
  let b = 0;
  let start = pos;
  let end = pos;
  for (const op of ops) {
    if (op.type === 'delete') continue;
    const len = op.text.length;
    if (op.type === 'insert') {
      if (b + len === pos) start = b;
      if (b === pos) end = b + len;
    }
    b += len;
    if (b > pos && op.type === 'equal') break;
  }
  return [start, end];
}

export function countStatuses(statuses: Map<string, DraftStatus>): Record<DraftStatus, number> {
  const counts: Record<DraftStatus, number> = { fixed: 0, still: 0, unchanged: 0 };
  for (const s of statuses.values()) counts[s]++;
  return counts;
}

// ---------------------------------------------------------------------------
// Drafts of one composition
// ---------------------------------------------------------------------------

type DraftFields = Pick<Submission, 'id'> & { first_draft_id?: string | null; draft_number?: number | null };

/** The first draft's id: what all drafts of one composition share. */
export function compositionId(s: DraftFields): string {
  return s.first_draft_id ?? s.id;
}

export function draftNumber(s: DraftFields): number {
  return s.draft_number ?? 1;
}

/** Submissions grouped by composition, drafts in order; groups keep the order of their newest draft. */
export function groupDrafts<T extends DraftFields>(subs: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const s of subs) {
    const key = compositionId(s);
    const g = groups.get(key);
    if (g) g.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.values()].map((g) => [...g].sort((x, y) => draftNumber(x) - draftNumber(y)));
}

// ---------------------------------------------------------------------------
// Problems of a draft, from its feedback
// ---------------------------------------------------------------------------

/** A problem of one draft: where it is, and (for "hints only") its marks. */
export interface DraftItem extends DraftSpan {
  original: string;
  marks?: HintMark[];
}

/** The corrections of a draft, placed in its text, in reading order. */
export function itemsFromRevisions(text: string, revisions: SentenceRevision[] | null | undefined): DraftItem[] {
  return placeRevisions(text, withRevisionIds(revisions)).placed.map((p) => ({
    id: p.rev.id,
    start: p.start,
    end: p.end,
    original: text.slice(p.start, p.end),
    marks: p.rev.marks,
  }));
}

/** The hints of a "hints only" draft, placed in its text, in reading order. */
export function itemsFromHints(text: string, hints: HintItem[]): DraftItem[] {
  return placeHints(text, hints).placed.map((p) => ({
    id: p.hint.id,
    start: p.start,
    end: p.end,
    original: text.slice(p.start, p.end),
    marks: p.hint.marks,
  }));
}
