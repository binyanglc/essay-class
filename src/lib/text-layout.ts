/**
 * Line-break clean-up for compositions.
 *
 * OCR keeps the line breaks of the paper, so a sentence can be cut in two
 * ("我们定了\n一个桌子…"). That looks wrong and makes the AI treat the two
 * halves as separate sentences.
 */

// Sentence-final punctuation, optionally followed by closing quotes / brackets
const SENTENCE_END = /[。！？!?…；;][”’"'」』）)》]*$/;
const WORD_CHAR = /[A-Za-z0-9]/;

/**
 * Positions of the line breaks ("\n") that only come from the edge of the page,
 * as opposed to real paragraph breaks (blank lines, indented lines, short lines
 * such as titles or the last line of a paragraph).
 *
 * - A line that stops mid-sentence and is at least 60% as long as the longest
 *   line is wrapped.
 * - With `joinFullLines` (OCR), a line that ends a sentence but runs to (about)
 *   the full width is wrapped too — on paper every line has the same width.
 */
export function softLineBreaks(text: string, { joinFullLines = false } = {}): Set<number> {
  const lines: { start: number; end: number }[] = [];
  let from = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      lines.push({ start: from, end: i });
      from = i + 1;
    }
  }
  const soft = new Set<number>();
  if (lines.length < 2) return soft;
  const lineText = (k: number) => text.slice(lines[k].start, lines[k].end);
  const longest = Math.max(...lines.map((_, k) => lineText(k).trim().length));

  for (let k = 1; k < lines.length; k++) {
    const prev = lineText(k - 1).trim();
    const next = lineText(k);
    const wrapped =
      prev.length > 0 &&
      next.trim().length > 0 &&
      !/^\s/.test(next) && // an indented line starts a new paragraph
      ((prev.length >= longest * 0.6 && !SENTENCE_END.test(prev)) ||
        (joinFullLines && prev.length >= longest * 0.9));
    if (wrapped) soft.add(lines[k - 1].end);
  }
  return soft;
}

/** Removes the line breaks that are only wraps (see softLineBreaks), keeping paragraphs. */
export function joinWrappedLines(text: string, options: { joinFullLines?: boolean } = {}): string {
  const t = text.replace(/\r\n?/g, '\n');
  const soft = softLineBreaks(t, options);
  let out = '';
  let from = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '\n' || !soft.has(i)) continue;
    const left = (out + t.slice(from, i)).replace(/[ \t]+$/, '');
    // Keep a space between two English words ("I like" + "China")
    out = left + (WORD_CHAR.test(left.slice(-1)) && WORD_CHAR.test(t.charAt(i + 1)) ? ' ' : '');
    from = i + 1;
  }
  return out + t.slice(from);
}
