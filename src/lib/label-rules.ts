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

/**
 * When a character swap turns one real word into another (权力 → 权利,
 * 严厉 → 严格), the problem is the word, not the character: the student's
 * word and the right word, both of 2–4 characters and both real words
 * (`isWord`), or null. A swap that leaves no real word (怀处 → 坏处, 不旦 →
 * 不但) is a character error, and so is a one-character word (在 → 再).
 */
export function wholeWords(
  original: string,
  change: PositionedChange,
  isWord: (word: string) => boolean
): { learner: string; target: string } | null {
  const { learner, target } = change;
  let pre = 0;
  while (pre < learner.length && pre < target.length && learner[pre] === target[pre]) pre++;
  let suf = 0;
  while (
    suf < learner.length - pre &&
    suf < target.length - pre &&
    learner[learner.length - 1 - suf] === target[target.length - 1 - suf]
  )
    suf++;
  const wrong = learner.slice(pre, learner.length - suf);
  const right = target.slice(pre, target.length - suf);
  if (!wrong || !right || wrong.length !== right.length) return null;
  const start = change.at + pre;
  const end = start + wrong.length;
  if (original.slice(start, end) !== wrong) return null;
  // The longest word around the swapped characters that is still a word once they are swapped
  for (let len = 4; len >= 2; len--) {
    for (let s = Math.max(0, end - len); s <= start && s + len <= original.length; s++) {
      const word = original.slice(s, s + len);
      const fixed = original.slice(s, start) + right + original.slice(end, s + len);
      if (word !== fixed && CJK_WORD.test(word) && isWord(word) && isWord(fixed)) return { learner: word, target: fixed };
    }
  }
  return null;
}

const CJK_WORD = /^[\u3400-\u9fff]+$/;
