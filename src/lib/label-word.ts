import { diffChars } from './track-changes';
import { isHskWord } from './hsk-words-2025';

/** Labels that record one wrong character ("坏 ← 怀"). */
const CHARACTER_CODES = new Set(['CHAR.SOUND', 'CHAR.SHAPE']);

/**
 * For a wrong-character label ("坏 ← 怀"), the word the right character is
 * part of in the corrected sentence ("坏处"), shown next to the label so the
 * student sees where it goes. The label itself keeps only the characters, so
 * the same mix-up in different words (坏处, 好坏) counts as one problem.
 * Only words of the 2025 HSK syllabus are named; '' when there is none.
 */
export function labelWord(
  tag: { code?: string | null; item_target?: string | null },
  original: string | null | undefined,
  revised: string | null | undefined
): string {
  const target = (tag.item_target ?? '').trim();
  if (!tag.code || !CHARACTER_CODES.has(tag.code) || !target || !original || !revised) return '';
  // Where the right character was put in: the first insertion that has it
  let pos = -1;
  let at = 0;
  for (const op of diffChars(original, revised)) {
    if (op.type === 'delete') continue;
    if (op.type === 'insert' && pos < 0) {
      const i = op.text.indexOf(target);
      if (i >= 0) pos = at + i;
    }
    at += op.text.length;
  }
  if (pos < 0) return '';
  const end = pos + target.length;
  // The longest syllabus word around it
  for (let len = 4; len > target.length; len--) {
    for (let s = Math.max(0, end - len); s <= pos && s + len <= revised.length; s++) {
      const word = revised.slice(s, s + len);
      if (isHskWord(word)) return word;
    }
  }
  return '';
}
