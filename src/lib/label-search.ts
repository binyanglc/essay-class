import { CODES, DOMAINS, RULES, getCode, operationFor } from './error-taxonomy';
import type { CodeInfo, RuleInfo } from './error-taxonomy';

/**
 * Finding a label in the list by typing (Chinese or English), and putting the
 * labels that fit a correction's changed words first. Runs in the browser —
 * no AI call, nothing to pay.
 */

/** One change inside a correction (student's words → replacement). */
export interface ChangeLike {
  learner: string;
  target: string;
}

export interface LabelHit {
  code: CodeInfo;
  /** Set when the hit is a misuse rule (choosing it picks the code and the rule). */
  rule: RuleInfo | null;
  /** Set when the hit is the teacher's own name for a label used in this class. */
  custom: string | null;
}

/** Extra words teachers might type for each label, besides its names, definition and examples. */
const KEYWORDS: Record<string, string> = {
  'CHAR.SOUND': '别字 错别字 错字 同音 近音 typo homophone wrong character',
  'CHAR.SHAPE': '别字 错别字 错字 形近 typo look-alike wrong character',
  'CHAR.INWORD': '缺字 多字 字序 漏字 missing character extra character',
  'CHAR.PINYIN': '拼音 英文 pinyin english',
  'CHAR.SCRIPT': '繁体 简体 繁简 traditional simplified',
  'CHAR.FORM': '错字 笔画 写错 stroke handwriting',
  'VOC.CHOICE': '用词 选词 词义 意思 近义词 同义词 wrong word meaning synonym',
  'VOC.COLLOC': '搭配 动宾 collocation verb object goes with',
  'VOC.MEASURE': '量词 个 本 件 张 只 条 位 杯 双 辆 classifier measure',
  'VOC.POS': '词性 名词 动词 形容词 noun verb adjective',
  'VOC.SEPARABLE': '离合词 见面 帮忙 睡觉 结婚 毕业 生气 聊天 洗澡 跳舞 游泳 唱歌 separable',
  'VOC.CALQUE': '直译 生造 中式英语 翻译 literal translation chinglish made-up',
  'GRAM.LE': '了 le aspect completed action change 变化',
  'GRAM.GUOZHE': '过 着 guo zhe experience 经历 持续',
  'GRAM.DE': '的 地 得 de',
  'GRAM.COMP': '补语 结果补语 趋向补语 可能补语 程度补语 时量补语 动量补语 完 好 到 懂 见 complement result direction potential',
  'GRAM.BA': '把 ba 把字句',
  'GRAM.BEI': '被 叫 让 bei passive 被动',
  'GRAM.COMPAR': '比 比较 没有 一样 跟 更 comparison compare',
  'GRAM.SHIDE': '是的 是……的 shi de',
  'GRAM.NEG': '不 没 没有 否定 bu mei negation negative not',
  'GRAM.PREP': '介词 在 给 对 跟 向 从 往 离 为 preposition',
  'GRAM.ADV': '副词 也 都 就 才 再 又 还 adverb',
  'GRAM.MODAL': '能愿动词 助动词 会 能 可以 要 想 应该 modal can',
  'GRAM.QUESTION': '疑问 问句 吗 呢 什么 谁 哪 question',
  'GRAM.ORDER': '语序 顺序 位置 词序 word order position',
  'GRAM.CONSTIT': '成分 缺 多余 残缺 主语 谓语 宾语 missing extra subject verb object',
  'GRAM.BLEND': '杂糅 句式 原因是因为 mixed structure',
  'GRAM.CONJ': '连词 关联词 和 但是 所以 因为 虽然 而且 然后 conjunction',
  'GRAM.OTHER': '其他 other',
  'PUNC.BOUNDARY': '断句 句号 逗号 一逗到底 run-on period comma full stop',
  'PUNC.MARK': '标点 顿号 引号 书名号 冒号 punctuation',
  'PUNC.HALFWIDTH': '半角 英文标点 全角 half-width english punctuation',
  'DISC.CONNECT': '衔接 连接 过渡 然后 linking transition connector',
  'DISC.REFER': '指称 代词 主语重复 指代 他 她 它 pronoun repeated subject',
  'DISC.COHERE': '连贯 逻辑 意思跳跃 矛盾 coherence logic flow',
  'REG.COLLOQ': '口语 太口语 挺 特 啥 咋 colloquial informal spoken',
  'REG.FORMAL': '书面语 正式 进行 formal written',
  'REG.PRAGMATIC': '得体 礼貌 您 polite politeness rude',
  'EXPR.NATURAL': '地道 自然 不自然 更好 natural idiomatic better phrasing',
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

interface Entry {
  hit: LabelHit;
  /** The label's own names (best match). */
  names: string;
  /** Keywords. */
  keys: string;
  /** Definition and examples. */
  text: string;
}

/** Words in Chinese brackets, like （没有错）, count as keywords, not as the name. */
const BRACKETS = /（[^）]*）/g;

function codeEntry(c: CodeInfo): Entry {
  const domain = DOMAINS.find((d) => d.id === c.domain)!;
  return {
    hit: { code: c, rule: null, custom: null },
    names: norm(`${c.en} ${c.zh.replace(BRACKETS, '')} ${c.code}`),
    keys: norm(`${KEYWORDS[c.code] ?? ''} ${c.zh} ${domain.en} ${domain.zh}`),
    text: norm(`${c.definition} ${c.examples.join(' ')}`),
  };
}

function ruleEntry(r: RuleInfo): Entry {
  const c = getCode(r.code)!;
  return {
    hit: { code: c, rule: r, custom: null },
    names: norm(`${r.en} ${r.zh}`),
    keys: norm(`${c.en} ${c.zh}`),
    text: norm(r.example),
  };
}

const CODE_ENTRIES = CODES.map(codeEntry);
const RULE_ENTRIES = RULES.map(ruleEntry);

function score(e: Entry, terms: string[]): number {
  let total = 0;
  for (const t of terms) {
    if (e.names.startsWith(t)) total += 6;
    else if (e.names.includes(t)) total += 4;
    else if (e.keys.includes(t)) total += 3;
    else if (e.text.includes(t)) total += 1;
    else return 0; // every word has to match somewhere
  }
  return total;
}

/**
 * Labels matching what the teacher typed: categories, misuse rules, and the
 * class's own label names. Best matches first; an empty query returns nothing.
 */
export function searchLabels(query: string, custom: { code: string; custom_label: string }[] = []): LabelHit[] {
  const q = norm(query);
  if (!q) return [];
  const terms = q.split(' ');
  const scored: { hit: LabelHit; s: number; order: number }[] = [];
  CODE_ENTRIES.forEach((e, i) => {
    const s = score(e, terms);
    if (s) scored.push({ hit: e.hit, s: s + 0.5, order: i }); // a category beats its own rule on a tie
  });
  RULE_ENTRIES.forEach((e, i) => {
    const s = score(e, terms);
    if (s) scored.push({ hit: e.hit, s, order: CODES.length + i });
  });
  const seen = new Set<string>();
  custom.forEach((c, i) => {
    const code = getCode(c.code);
    const name = c.custom_label.trim();
    const key = `${c.code}|${name}`;
    if (!code || !name || seen.has(key)) return;
    seen.add(key);
    const n = norm(name);
    const s = n.startsWith(terms[0]) && terms.every((t) => n.includes(t)) ? 7 : terms.every((t) => n.includes(t)) ? 5 : 0;
    if (s) scored.push({ hit: { code, rule: null, custom: name }, s, order: -100 + i });
  });
  return scored.sort((a, b) => b.s - a.s || a.order - b.order).map((x) => x.hit);
}

/**
 * Words that point to labels when a change only adds, removes or swaps them
 * (了 added, 的 → 得, 不 → 没, 和 → 然后 …).
 */
const MARKERS: [string[], string[]][] = [
  [['GRAM.LE'], ['了']],
  [['GRAM.GUOZHE'], ['过', '着']],
  [['GRAM.DE'], ['的', '地', '得']],
  [['GRAM.BA'], ['把']],
  [['GRAM.BEI'], ['被']],
  [['GRAM.COMPAR'], ['比', '一样', '没有']],
  [['GRAM.NEG'], ['不', '没']],
  [['GRAM.ADV'], ['也', '都', '就', '才', '再', '又', '还']],
  [['GRAM.MODAL'], ['可以', '会', '能', '要', '想']],
  [['GRAM.QUESTION'], ['吗', '呢']],
  [['GRAM.CONJ', 'DISC.CONNECT'], ['但是', '可是', '所以', '因为', '虽然', '而且', '然后', '另外', '还有', '和']],
  [['REG.COLLOQ'], ['挺', '啥', '咋']],
];
const MEASURE_WORDS = new Set(['个', '本', '件', '张', '只', '条', '位', '杯', '双', '辆', '台', '家', '次', '遍', '支', '把', '块', '口', '套', '首']);
const PUNCT = /^[\s,.;:?!'"()，。、；：？！“”‘’（）《》…—-]*$/;
const ASCII_PUNCT = /[,.;:?!]/;

/** The text with the given words taken out (longest first). */
const without = (s: string, words: string[]) =>
  [...words].sort((a, b) => b.length - a.length).reduce((out, w) => out.split(w).join(''), s);

/**
 * Labels that fit this correction's changes, for the top of the list before
 * the teacher types anything. Only a hint — the teacher still chooses.
 */
export function suggestForChanges(changes: ChangeLike[], max = 4): LabelHit[] {
  const codes: string[] = [];
  const add = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  const generic: string[] = [];
  for (const { learner, target } of changes) {
    const l = learner.trim();
    const t = target.trim();
    if (!l && !t) continue;
    if (PUNCT.test(l) && PUNCT.test(t)) {
      if (ASCII_PUNCT.test(l) && !ASCII_PUNCT.test(t)) add('PUNC.HALFWIDTH');
      else if ((l.includes('，') && t.includes('。')) || (l.includes('。') && t.includes('，'))) add('PUNC.BOUNDARY');
      else add('PUNC.MARK');
      continue;
    }
    let found = false;
    for (const [group, markers] of MARKERS) {
      // The change is only about these words
      if (without(l, markers) === without(t, markers)) {
        group.forEach(add);
        found = true;
      }
    }
    if (!found && (MEASURE_WORDS.has(l) || !l) && (MEASURE_WORDS.has(t) || !t)) {
      add('VOC.MEASURE');
      found = true;
    }
    if (found) continue;
    const op = operationFor(l, t);
    if (op === 'order') generic.push('GRAM.ORDER');
    else if (op === 'missing' || op === 'unnecessary') generic.push('GRAM.CONSTIT');
    else generic.push('VOC.CHOICE', 'VOC.COLLOC');
  }
  for (const g of generic) add(g);
  return codes.slice(0, max).map((code) => ({ code: getCode(code)!, rule: null, custom: null }));
}

/** Text for one hit in the list. */
export function hitTitle(h: LabelHit): string {
  if (h.custom) return h.custom;
  if (h.rule) return `${h.rule.en} · ${h.rule.zh}`;
  return h.code.en.includes(h.code.zh) ? h.code.en : `${h.code.en} · ${h.code.zh}`;
}

/** Smaller text under a hit (which category a rule or own name belongs to). */
export function hitSubtitle(h: LabelHit): string {
  if (h.custom || h.rule) return h.code.en.includes(h.code.zh) ? h.code.en : `${h.code.en} · ${h.code.zh}`;
  return '';
}

export const hitKey = (h: LabelHit) => `${h.code.code}|${h.rule?.id ?? ''}|${h.custom ?? ''}`;
