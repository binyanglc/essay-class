/**
 * Labels that follow from the change itself — no AI judgement needed.
 *
 * Some corrections can only mean one thing: adding or removing 了 is always a
 * 了 problem, 的 ↔ 得 is always 的/地/得, a character swapped for one that
 * sounds the same is a same-sounding character, and , → ， is English
 * punctuation. The AI's label is overridden in these cases (the AI's own
 * answer stays in ai_original), so the counts can't drift.
 */

import { pinyin } from 'pinyin-pro';
import { diffChars } from './track-changes';

/** One change inside a correction, with where it starts in the student's sentence. */
export interface PositionedChange {
  learner: string;
  target: string;
  /** Index in the original sentence where the change starts. */
  at: number;
}

/** The separate changes in a correction, in order, with their positions. */
export function changesAt(original: string, revised: string): PositionedChange[] {
  const out: PositionedChange[] = [];
  let cur: PositionedChange | null = null;
  let pos = 0;
  for (const op of diffChars(original, revised)) {
    if (op.type === 'equal') {
      if (cur) out.push(cur);
      cur = null;
      pos += op.text.length;
      continue;
    }
    cur = cur ?? { learner: '', target: '', at: pos };
    if (op.type === 'delete') {
      cur.learner += op.text;
      pos += op.text.length;
    } else {
      cur.target += op.text;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** The part that actually differs: common beginning and end removed. */
export function coreOf(learner: string, target: string): { learner: string; target: string } {
  let a = learner.trim();
  let b = target.trim();
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  a = a.slice(i);
  b = b.slice(i);
  let j = 0;
  while (j < a.length && j < b.length && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return { learner: a.slice(0, a.length - j), target: b.slice(0, b.length - j) };
}

const CJK = /^[㐀-鿿]$/;

function readings(ch: string): string[] {
  const r = pinyin(ch, { toneType: 'none', multiple: true, type: 'array' }) as string[];
  return r.filter((s) => /^[a-zü]+$/i.test(s));
}

/** True when two characters can be read the same (tones ignored), e.g. 在/再, 做/作, 已/以. */
export function sameSound(a: string, b: string): boolean {
  if (a === b || !CJK.test(a) || !CJK.test(b)) return false;
  const ra = readings(a);
  return ra.length > 0 && readings(b).some((r) => ra.includes(r));
}

const DE = new Set(['的', '地', '得']);
const HALF_TO_FULL: Record<string, string> = {
  ',': '，', '.': '。', '?': '？', '!': '！', ':': '：', ';': '；', '(': '（', ')': '）',
};

/** English punctuation turned into the matching Chinese marks (spaces ignored). */
export function isHalfWidthFix(learner: string, target: string): boolean {
  const l = learner.replace(/\s/g, '');
  const t = target.replace(/\s/g, '');
  return !!l && l.length === t.length && [...l].every((ch, i) => HALF_TO_FULL[ch] === t[i]);
}

export type RuleKind = 'LE' | 'DE' | 'SOUND' | 'HALFWIDTH';

/** What a change must be, when the change alone decides it. */
export function ruleKind(learner: string, target: string): RuleKind | null {
  const c = coreOf(learner, target);
  if (!c.learner && !c.target) return null;
  if ((c.learner === '了' && !c.target) || (!c.learner && c.target === '了')) return 'LE';
  const isDe = (s: string) => s === '' || DE.has(s);
  if (isDe(c.learner) && isDe(c.target) && (c.learner || c.target)) return 'DE';
  if (c.learner.length === 1 && c.target.length === 1 && sameSound(c.learner, c.target)) return 'SOUND';
  if (isHalfWidthFix(c.learner, c.target)) return 'HALFWIDTH';
  return null;
}

export const RULE_KIND_CODE: Record<RuleKind, string> = {
  LE: 'GRAM.LE',
  DE: 'GRAM.DE',
  SOUND: 'CHAR.SOUND',
  HALFWIDTH: 'PUNC.HALFWIDTH',
};

const CLAUSE_BREAK = /[，。！？；,.!?;\n]/;

/** The student's words from the start of the clause up to a position. */
export function clauseBefore(text: string, at: number): string {
  let i = at - 1;
  while (i >= 0 && !CLAUSE_BREAK.test(text[i])) i--;
  return text.slice(i + 1, at);
}

/** 了 removed from a clause with 没 in it: "No 了 after 没". */
export function isLeAfterMei(original: string, change: PositionedChange): boolean {
  return coreOf(change.learner, change.target).learner === '了' && /没/.test(clauseBefore(original, change.at + change.learner.indexOf('了')));
}
