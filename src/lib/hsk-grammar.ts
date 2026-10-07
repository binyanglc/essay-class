import { HSK_GRAMMAR_2025 } from './hsk-grammar-2025';
import type { GrammarPoint } from './hsk-grammar-2025';

export type { GrammarPoint } from './hsk-grammar-2025';
export { HSK_GRAMMAR_2025, HSK_SYLLABUS } from './hsk-grammar-2025';

/** Lookups over the 2025 HSK syllabus grammar points (data in hsk-grammar-2025.ts). */

const BY_ID = new Map(HSK_GRAMMAR_2025.map((g) => [g.id, g]));

export function getGrammarPoint(id: string | null | undefined): GrammarPoint | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isGrammarPoint(v: unknown): v is string {
  return typeof v === 'string' && BY_ID.has(v);
}

/** Grammar points listed under a label code: the ones counted there first, then the ones that also belong. */
export function grammarPointsFor(code: string | null | undefined): GrammarPoint[] {
  if (!code) return [];
  const main = HSK_GRAMMAR_2025.filter((g) => g.families[0] === code);
  const also = HSK_GRAMMAR_2025.filter((g) => g.families.indexOf(code) > 0);
  return [...main, ...also];
}

/** "HSK 1", "HSK 7–9". */
export function levelLabel(g: GrammarPoint): string {
  return `HSK ${g.level.replace('-', '–')}`;
}

/** Where it sits in the syllabus: 词类 · 助词 · 动态助词. */
export function grammarPointPath(g: GrammarPoint): string {
  return [g.cat, g.sub, g.item].filter(Boolean).join(' · ');
}

/** Short name, as in a label: 了¹ · 存现句1（1）处所+是+名词 · 陈述句. */
export function grammarPointName(g: GrammarPoint): string {
  if (!g.text) return g.item || g.sub || g.cat;
  if (g.text.startsWith('（') && g.item && !/^[（(]/.test(g.item)) return `${g.item}${g.text}`;
  return g.text;
}

/** Full description for a tooltip: HSK 1 · 词类 · 助词 · 动态助词 · 了¹ (p. 308). */
export function grammarPointTitle(g: GrammarPoint): string {
  return `${levelLabel(g)} · ${grammarPointPath(g)}${g.text ? ` · ${g.text}` : ''} (p. ${g.page})`;
}

const SUPERSCRIPTS = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/g;

/** Chinese words in a grammar point (了, 快要, 以前 …), for matching a correction's changes. */
export function grammarPointWords(g: GrammarPoint): string[] {
  const text = `${g.text}`.replace(SUPERSCRIPTS, '').replace(/（[^）]*）/g, (m) => m.replace(/[（）]/g, ' '));
  const runs = text.match(/[一-鿿]+/g) ?? [];
  // Grammatical terms in the description are not words the student wrote
  const TERMS = /(名词|动词|形容词|代词|数词|量词|副词|介词|连词|助词|短语|主语|谓语|宾语|定语|状语|补语|处所|数量|成分|表示|用法|结构|句子|专用|借用|处所词|心理|其他|人称|动态|语气|施事|非生物体)/;
  return Array.from(new Set(runs.filter((w) => w.length <= 4 && !TERMS.test(w))));
}

/**
 * The code's grammar points split into the ones that fit the correction (their
 * words were added, removed or changed by it) and the rest.
 */
export function rankGrammarPoints(
  code: string | null | undefined,
  changed: string[]
): { fits: GrammarPoint[]; rest: GrammarPoint[] } {
  const points = grammarPointsFor(code);
  const text = changed.join(' ');
  if (!text.trim()) return { fits: [], rest: points };
  const fits = (g: GrammarPoint) => grammarPointWords(g).some((w) => text.includes(w));
  return { fits: points.filter(fits), rest: points.filter((g) => !fits(g)) };
}

/**
 * Grammar points a correction may be about, for the AI to choose from: points
 * whose words appear in the changed text. Longer matching words first (快要
 * before 要), then lower levels, then syllabus order; at most `max`.
 */
export function grammarCandidates(changed: string[], max = 8): GrammarPoint[] {
  const text = changed.join(' ');
  if (!text.trim()) return [];
  const scored: { g: GrammarPoint; score: number; order: number }[] = [];
  HSK_GRAMMAR_2025.forEach((g, order) => {
    const hits = grammarPointWords(g).filter((w) => text.includes(w));
    if (hits.length) scored.push({ g, score: Math.max(...hits.map((w) => w.length)), order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((x) => x.g);
}
