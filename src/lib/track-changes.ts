/**
 * Track changes for a student composition.
 *
 * Places each sentence revision ({ original, revised }) back into the full
 * text and computes a character-level diff, so the whole composition can be
 * shown Word-style: deleted text struck through, inserted text underlined.
 *
 * Pure functions, no React — shared by the teacher and student views.
 */

export interface RevisionLike {
  original: string;
  revised: string;
  /** Optional anchor: [start, end) offsets of `original` in the text. */
  start?: number;
  end?: number;
}

export type DiffOp = { type: 'equal' | 'delete' | 'insert'; text: string };

/** How a revision was located in the text. */
export type MatchKind = 'offsets' | 'exact' | 'normalized' | 'fuzzy';

export interface PlacedRevision<R extends RevisionLike> {
  rev: R;
  /** Index in the input array. */
  index: number;
  /** [start, end) of the student's own text that this revision replaces. */
  start: number;
  end: number;
  match: MatchKind;
  /** Revised text, re-based onto the student's actual wording when the AI quoted it slightly wrong. */
  revised: string;
  /** Character diff from text.slice(start, end) to `revised`. */
  ops: DiffOp[];
}

export interface UnplacedRevision<R extends RevisionLike> {
  rev: R;
  index: number;
  reason: 'not-found' | 'overlap' | 'empty';
}

export interface Placement<R extends RevisionLike> {
  /** Sorted by position in the text. */
  placed: PlacedRevision<R>[];
  unplaced: UnplacedRevision<R>[];
}

export type Segment<R extends RevisionLike> =
  | { kind: 'plain'; start: number; end: number; text: string }
  | { kind: 'revision'; placed: PlacedRevision<R> };

// ---------------------------------------------------------------------------
// Normalisation (for matching only): ignore whitespace, unify punctuation
// width and quote styles, fold full-width letters/digits.
// ---------------------------------------------------------------------------

const CANON: Record<string, string> = {
  '，': ',', '．': '。', '.': '。', '！': '!', '？': '?', '：': ':', '；': ';',
  '（': '(', '）': ')', '“': '"', '”': '"', '「': '"', '」': '"', '‘': "'",
  '’': "'", '『': "'", '』': "'",
};

function canonChars(c: string): string {
  const n = c.normalize('NFKC');
  let out = '';
  for (const ch of n) out += CANON[ch] ?? ch;
  return out;
}

const isSpace = (c: string) => /\s/.test(c);

function normalize(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) if (!isSpace(s[i])) out += canonChars(s[i]);
  return out;
}

/** Normalised text plus a map from each normalised index back to the source index. */
function normalizeWithMap(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (isSpace(s[i])) continue;
    const c = canonChars(s[i]);
    for (let k = 0; k < c.length; k++) map.push(i);
    text += c;
  }
  return { text, map };
}

function findAll(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

/**
 * Approximate substring search (Sellers): the substring of `text` with the
 * smallest edit distance to `pat`, if that distance is within `maxDist`.
 */
function fuzzyFind(text: string, pat: string, maxDist: number) {
  const n = text.length;
  const m = pat.length;
  if (!m || !n) return null;
  let prev = new Array<number>(n + 1).fill(0);
  let prevStart = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    const curStart = new Array<number>(n + 1);
    cur[0] = i;
    curStart[0] = 0;
    for (let j = 1; j <= n; j++) {
      let best = prev[j - 1] + (pat[i - 1] === text[j - 1] ? 0 : 1);
      let bs = prevStart[j - 1];
      if (prev[j] + 1 < best) {
        best = prev[j] + 1;
        bs = prevStart[j];
      }
      if (cur[j - 1] + 1 < best) {
        best = cur[j - 1] + 1;
        bs = curStart[j - 1];
      }
      cur[j] = best;
      curStart[j] = bs;
    }
    prev = cur;
    prevStart = curStart;
  }
  let bestJ = -1;
  let bestD = Infinity;
  for (let j = 1; j <= n; j++) {
    if (prev[j] < bestD) {
      bestD = prev[j];
      bestJ = j;
    }
  }
  if (bestJ < 0 || bestD > maxDist || prevStart[bestJ] >= bestJ) return null;
  return { start: prevStart[bestJ], end: bestJ, dist: bestD };
}

// ---------------------------------------------------------------------------
// Character diff
// ---------------------------------------------------------------------------

type Eq = (a: string, b: string) => boolean;
const same: Eq = (a, b) => a === b;

/** LCS table over a and b: dp[i][j] = LCS length of a[i..] and b[j..]. */
function lcsTable(a: string, b: string, eq: Eq): number[][] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

function pushOp(ops: DiffOp[], type: DiffOp['type'], text: string) {
  if (!text) return;
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.text += text;
  else ops.push({ type, text });
}

function rawDiff(a: string, b: string): DiffOp[] {
  const ops: DiffOp[] = [];
  if (a.length * b.length > 250_000) {
    pushOp(ops, 'delete', a);
    pushOp(ops, 'insert', b);
    return ops;
  }
  const dp = lcsTable(a, b, same);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushOp(ops, 'equal', a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushOp(ops, 'delete', a[i++]);
    } else {
      pushOp(ops, 'insert', b[j++]);
    }
  }
  pushOp(ops, 'delete', a.slice(i));
  pushOp(ops, 'insert', b.slice(j));
  return ops;
}

// ASCII + CJK + full-width punctuation, curly quotes, dashes, ellipsis (no \p{P}: the app targets ES2017)
const PUNCT = /[\s!-/:-@[-`{-~\u2010-\u201F\u2026\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/;

/** Within each run of changes, show all deleted text first, then the inserted text. */
function groupRuns(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = [];
  let del = '';
  let ins = '';
  const flush = () => {
    pushOp(out, 'delete', del);
    pushOp(out, 'insert', ins);
    del = '';
    ins = '';
  };
  for (const op of ops) {
    if (op.type === 'equal') {
      flush();
      pushOp(out, 'equal', op.text);
    } else if (op.type === 'delete') del += op.text;
    else ins += op.text;
  }
  flush();
  return out;
}

/**
 * Readability clean-up: a single matching character stuck between two changes
 * (e.g. 以后 → 后来 matches only on 后) reads better as one whole replacement.
 */
function foldTinyEqualities(ops: DiffOp[]): DiffOp[] {
  let list = groupRuns(ops);
  for (let guard = 0; guard < 100; guard++) {
    const k = list.findIndex(
      (op, idx) =>
        op.type === 'equal' &&
        op.text.length === 1 &&
        !PUNCT.test(op.text) &&
        idx > 0 &&
        idx < list.length - 1 &&
        list[idx - 1].type !== 'equal' &&
        list[idx + 1].type !== 'equal'
    );
    if (k === -1) break;
    const merged: DiffOp[] = list.slice(k - 1, k + 2).flatMap((op) =>
      op.type === 'equal'
        ? [
            { type: 'delete' as const, text: op.text },
            { type: 'insert' as const, text: op.text },
          ]
        : [op]
    );
    // Deleted text keeps its order, inserted text keeps its order.
    list = groupRuns([...list.slice(0, k - 1), ...merged, ...list.slice(k + 2)]);
  }
  return list;
}

/** Character-level diff from `a` to `b`, tidied for display. */
export function diffChars(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ type: 'equal', text: a }] : [];
  return foldTinyEqualities(rawDiff(a, b));
}

/**
 * The AI sometimes quotes the student's sentence slightly wrong (punctuation,
 * a character). Re-apply only the edits it intended (aiOriginal → aiRevised)
 * onto the student's actual wording, so we never show changes the AI didn't mean.
 */
export function rebaseRevision(aiOriginal: string, aiRevised: string, actual: string): string {
  if (aiOriginal === actual) return aiRevised;
  if (aiOriginal.length * actual.length > 250_000) return aiRevised;

  // 1) Map aiOriginal chars to actual chars (punctuation width etc. treated as equal).
  const eq: Eq = (x, y) => x === y || canonChars(x) === canonChars(y);
  const dp = lcsTable(aiOriginal, actual, eq);
  const map = new Array<number>(aiOriginal.length).fill(-1);
  for (let i = 0, j = 0; i < aiOriginal.length && j < actual.length; ) {
    if (eq(aiOriginal[i], actual[j])) map[i++] = j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }

  // 2) Intended edits, per aiOriginal char: keep or delete, plus insertions before it.
  const keep = new Array<boolean>(aiOriginal.length).fill(true);
  const insBefore = new Array<string>(aiOriginal.length + 1).fill('');
  let pos = 0;
  for (const op of rawDiff(aiOriginal, aiRevised)) {
    if (op.type === 'insert') insBefore[pos] += op.text;
    else {
      if (op.type === 'delete') for (let k = 0; k < op.text.length; k++) keep[pos + k] = false;
      pos += op.text.length;
    }
  }

  // 3) Walk the student's text, applying those edits; unmatched student chars are kept.
  let out = '';
  let j = 0;
  for (let i = 0; i < aiOriginal.length; i++) {
    out += insBefore[i];
    if (map[i] < 0) continue;
    while (j < map[i]) out += actual[j++];
    if (keep[i]) out += actual[map[i]];
    j = map[i] + 1;
  }
  return out + actual.slice(j) + insBefore[aiOriginal.length];
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export function placeRevisions<R extends RevisionLike>(text: string, revisions: R[]): Placement<R> {
  const placed: PlacedRevision<R>[] = [];
  const unplaced: UnplacedRevision<R>[] = [];
  const spans: Array<[number, number]> = [];
  const norm = normalizeWithMap(text);
  let cursor = 0;

  const overlaps = (s: number, e: number) => spans.some(([a, b]) => s < b && a < e);
  // Prefer the first free occurrence after the previous revision (the AI lists them in order).
  const pick = (cands: Array<[number, number]>) => {
    const free = cands.filter(([s, e]) => !overlaps(s, e));
    return free.find(([s]) => s >= cursor) ?? free[0] ?? null;
  };

  revisions.forEach((rev, index) => {
    const original = rev.original ?? '';
    const normOriginal = normalize(original);
    if (!normOriginal) {
      unplaced.push({ rev, index, reason: 'empty' });
      return;
    }
    let span: [number, number] | null = null;
    let match: MatchKind = 'exact';
    let blocked = false;

    // 1. Stored offsets (teacher-selected text, or anchored earlier)
    const { start, end } = rev;
    if (
      typeof start === 'number' &&
      typeof end === 'number' &&
      start >= 0 &&
      start < end &&
      end <= text.length &&
      text.slice(start, end) === original
    ) {
      if (overlaps(start, end)) blocked = true;
      else {
        span = [start, end];
        match = 'offsets';
      }
    }
    // 2. Exact quote
    if (!span) {
      const cands = findAll(text, original).map((s): [number, number] => [s, s + original.length]);
      span = pick(cands);
      if (span) match = 'exact';
      else if (cands.length) blocked = true;
    }
    // 3. Same text, ignoring whitespace / punctuation width
    if (!span) {
      const cands = findAll(norm.text, normOriginal).map((k): [number, number] => [
        norm.map[k],
        norm.map[k + normOriginal.length - 1] + 1,
      ]);
      span = pick(cands);
      if (span) match = 'normalized';
      else if (cands.length) blocked = true;
    }
    // 4. Close match (AI changed a character or two while quoting)
    if (!span && normOriginal.length >= 4) {
      const hit = fuzzyFind(norm.text, normOriginal, Math.max(1, Math.floor(normOriginal.length * 0.2)));
      if (hit) {
        const s = norm.map[hit.start];
        const e = norm.map[hit.end - 1] + 1;
        if (overlaps(s, e)) blocked = true;
        else {
          span = [s, e];
          match = 'fuzzy';
        }
      }
    }

    if (!span) {
      unplaced.push({ rev, index, reason: blocked ? 'overlap' : 'not-found' });
      return;
    }
    const actual = text.slice(span[0], span[1]);
    const revised = rebaseRevision(original, rev.revised ?? '', actual);
    spans.push(span);
    cursor = span[1];
    placed.push({ rev, index, start: span[0], end: span[1], match, revised, ops: diffChars(actual, revised) });
  });

  placed.sort((a, b) => a.start - b.start);
  return { placed, unplaced };
}

/** Splits the text into plain runs and placed revisions, in reading order. */
export function segmentText<R extends RevisionLike>(text: string, placed: PlacedRevision<R>[]): Segment<R>[] {
  const out: Segment<R>[] = [];
  let pos = 0;
  for (const p of placed) {
    if (p.start > pos) out.push({ kind: 'plain', start: pos, end: p.start, text: text.slice(pos, p.start) });
    out.push({ kind: 'revision', placed: p });
    pos = p.end;
  }
  if (pos < text.length) out.push({ kind: 'plain', start: pos, end: text.length, text: text.slice(pos) });
  return out;
}

/** The composition with every placed revision applied. */
export function applyRevisions<R extends RevisionLike>(text: string, placed: PlacedRevision<R>[]): string {
  return segmentText(text, placed)
    .map((s) => (s.kind === 'plain' ? s.text : s.placed.revised))
    .join('');
}

/** True when `needle` appears in `hay`, ignoring whitespace and punctuation width. */
export function containsLoosely(hay: string, needle: string): boolean {
  const n = normalize(needle);
  return !!n && normalize(hay).includes(n);
}
