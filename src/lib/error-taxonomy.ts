/**
 * The error label list (taxonomy v1-rc3, see the project docs
 * claude/error-tag-taxonomy.md and claude/hsk2025-grammar-import.md).
 *
 * Three layers:
 *   domain   (7)  — Characters, Vocabulary, Grammar, …   → error_tags.error_type
 *   code     (51) — e.g. GRAM.LE (了), VOC.COLLOC          → error_tags.code
 *   item          — what exactly went wrong:
 *                   a pair of words ("认识 ← 知道"),        → error_tags.item_target / item_learner
 *                   a misuse rule (R.LE.NEG),              → error_tags.rule
 *                   an HSK 2025 grammar point (H25-1-025)  → error_tags.grammar_point
 *
 * v1-rc3 (2026-10-07) added 11 grammar codes for the 2025 HSK syllabus
 * (GRAM.PROG … GRAM.FIXED), used by teachers and the AI alike.
 *
 * The AI and the teacher both choose from this list, so the same problem is
 * always counted under the same name. A teacher can still give a label their
 * own wording (custom_label); it stays under its code for the statistics.
 */

import type { ErrorType } from '@/types';
import { getGrammarPoint, grammarPointName } from './hsk-grammar';

export const TAXONOMY_VERSION = 'v1-rc3';

export type Domain = 'CHAR' | 'VOC' | 'GRAM' | 'PUNC' | 'DISC' | 'REG' | 'EXPR';
/** error = wrong; infelicity = acceptable but unnatural; variant = regional / script variant, not wrong. */
export type Nature = 'error' | 'infelicity' | 'variant';
/** global = gets in the way of understanding; local = doesn't. */
export type Severity = 'global' | 'local';
export type Operation = 'missing' | 'unnecessary' | 'replace' | 'order';
/**
 * suggested = the AI's, not checked yet; confirmed / modified = checked by the teacher;
 * accepted = left as it was by the teacher, who opened the feedback and then released it (migration v14);
 * added = by the teacher.
 */
export type TagStatus = 'suggested' | 'confirmed' | 'accepted' | 'modified' | 'added' | 'deleted';
export type DeleteReason = 'ai_wrong' | 'not_error' | 'not_now';

/** What a label records about the exact problem. */
export type ItemKind =
  /** "right ← what the student wrote", e.g. 认识 ← 知道 */
  | 'pair'
  /** one word or character, e.g. the separable verb 见面 */
  | 'word'
  /** nothing beyond the code (and possibly a misuse rule) */
  | 'none';

export interface DomainInfo {
  id: Domain;
  errorType: ErrorType;
  en: string;
  zh: string;
}

export const DOMAINS: DomainInfo[] = [
  { id: 'CHAR', errorType: 'characters', en: 'Characters', zh: '汉字' },
  { id: 'VOC', errorType: 'vocabulary', en: 'Vocabulary', zh: '词汇' },
  { id: 'GRAM', errorType: 'grammar', en: 'Grammar', zh: '语法' },
  { id: 'PUNC', errorType: 'punctuation', en: 'Punctuation', zh: '标点' },
  { id: 'DISC', errorType: 'discourse', en: 'Linking & flow', zh: '语篇' },
  { id: 'REG', errorType: 'register', en: 'Register & tone', zh: '语体与得体' },
  { id: 'EXPR', errorType: 'expression', en: 'Natural expression', zh: '表达' },
];

export interface CodeInfo {
  code: string;
  domain: Domain;
  en: string;
  zh: string;
  /** Short definition (English) — shown to the AI and in the label picker. */
  definition: string;
  examples: string[];
  item: ItemKind;
  /** Default nature for this code (error unless stated). */
  nature?: Nature;
  /** false: only a teacher can use it (the AI can't see it in typed or OCR text). */
  ai?: boolean;
}

export const CODES: CodeInfo[] = [
  // ---- Characters ----------------------------------------------------------
  {
    code: 'CHAR.SOUND',
    domain: 'CHAR',
    en: 'Same-sounding character',
    zh: '同音、近音别字',
    definition:
      'The word is right but one character is replaced by another that sounds the same or similar. (的/地/得 mix-ups are GRAM.DE.)',
    examples: ['*在见 → 再见', '*高心 → 高兴'],
    item: 'pair',
  },
  {
    code: 'CHAR.SHAPE',
    domain: 'CHAR',
    en: 'Similar-looking character',
    zh: '形近别字',
    definition: 'One character is replaced by another that looks similar.',
    examples: ['*己经 → 已经', '*末来 → 未来'],
    item: 'pair',
  },
  {
    code: 'CHAR.INWORD',
    domain: 'CHAR',
    en: 'Character missing, extra or swapped in a word',
    zh: '词内缺字、多字、字序颠倒',
    definition:
      'What the student wrote is not a word: a character is missing, extra, or in the wrong order inside one word. If the student wrote another real word (兴趣 → 感兴趣), use a vocabulary or grammar code instead.',
    examples: ['*图馆 → 图书馆', '*习学 → 学习'],
    item: 'word',
  },
  {
    code: 'CHAR.PINYIN',
    domain: 'CHAR',
    en: 'Pinyin or English instead of characters',
    zh: '用拼音或英文代替汉字',
    definition: 'Pinyin or English is written where characters are needed.',
    examples: ['我喜欢 dǎ 篮球 → 打'],
    item: 'word',
  },
  {
    code: 'CHAR.SCRIPT',
    domain: 'CHAR',
    en: 'Traditional and simplified mixed',
    zh: '繁简混用',
    definition:
      'Traditional and simplified characters are mixed in one text. Writing consistently in traditional characters is NOT an error.',
    examples: ['我們去学校 (們 traditional, 学 simplified)'],
    item: 'word',
  },
  {
    code: 'CHAR.FORM',
    domain: 'CHAR',
    en: 'Miswritten character (strokes)',
    zh: '错字（不存在的字）',
    definition: 'A character written with wrong strokes or parts — teachers add this from the photo.',
    examples: [],
    item: 'word',
    ai: false,
  },

  // ---- Vocabulary ----------------------------------------------------------
  {
    code: 'VOC.CHOICE',
    domain: 'VOC',
    en: 'Word choice',
    zh: '近义词、词义误用',
    definition: 'The word itself has the wrong meaning here (often a near-synonym).',
    examples: ['*我知道他三年了 → 我认识他三年了'],
    item: 'pair',
  },
  {
    code: 'VOC.COLLOC',
    domain: 'VOC',
    en: 'Collocation',
    zh: '搭配不当',
    definition: "The word's meaning is right, but it doesn't go with the words around it.",
    examples: ['*穿帽子 → 戴帽子', '*玩篮球 → 打篮球'],
    item: 'pair',
  },
  {
    code: 'VOC.MEASURE',
    domain: 'VOC',
    en: 'Measure word',
    zh: '量词',
    definition: 'Wrong or missing measure word.',
    examples: ['*一个书 → 一本书', '*一只衣服 → 一件衣服'],
    item: 'pair',
  },
  {
    code: 'VOC.POS',
    domain: 'VOC',
    en: 'Part of speech',
    zh: '词性误用',
    definition: 'A word is used as the wrong part of speech (e.g. a noun as a verb or adjective).',
    examples: ['*我对中国历史很兴趣 → 我对中国历史很感兴趣'],
    item: 'pair',
  },
  {
    code: 'VOC.SEPARABLE',
    domain: 'VOC',
    en: 'Separable verb (离合词)',
    zh: '离合词',
    definition: 'A separable verb (见面, 帮忙, 毕业, 睡觉…) is used with an object or other words in the wrong place.',
    examples: ['*我见面他 → 我跟他见面'],
    item: 'word',
  },
  {
    code: 'VOC.CALQUE',
    domain: 'VOC',
    en: 'Made-up word or literal translation',
    zh: '生造词、英语直译',
    definition: 'A made-up word, or an English expression translated word for word.',
    examples: ['*我有一个好时间 → 我玩得很开心'],
    item: 'none',
  },

  // ---- Grammar (each code is a family of grammar points) --------------------
  {
    code: 'GRAM.LE',
    domain: 'GRAM',
    en: '了 (le)',
    zh: '了',
    definition: 'Missing, extra or misplaced 了 (after the verb, or at the end of the sentence).',
    examples: ['*我昨天很累了 → 我昨天很累', '*我昨天没去了 → 我昨天没去'],
    item: 'none',
  },
  {
    code: 'GRAM.GUOZHE',
    domain: 'GRAM',
    en: '过 / 着 (guo / zhe)',
    zh: '过、着',
    definition: 'Missing, extra or misplaced 过 or 着.',
    examples: ['*我没去中国过 → 我没去过中国', '*他穿一件红衣服着 → 他穿着一件红衣服'],
    item: 'word',
  },
  {
    code: 'GRAM.PROG',
    domain: 'GRAM',
    en: 'Progressive (在 / 正在 … 呢)',
    zh: '进行态',
    definition: 'Progressive aspect: 在 / 正在 before the verb, 呢 at the end. (过 and 着 are GRAM.GUOZHE.)',
    examples: ['*我在吃饭了 → 我在吃饭呢'],
    item: 'none',
  },
  {
    code: 'GRAM.DE',
    domain: 'GRAM',
    en: '的 / 地 / 得 (de)',
    zh: '的、地、得',
    definition: 'The wrong one of 的, 地, 得 — or a missing or extra one.',
    examples: ['*他跑的很快 → 他跑得很快'],
    item: 'pair',
  },
  {
    code: 'GRAM.COMP',
    domain: 'GRAM',
    en: 'Complements',
    zh: '补语',
    definition: 'Result, direction, potential, degree, duration or frequency complements.',
    examples: ['*我看了书完 → 我看完了书', '*我不能听懂 → 我听不懂'],
    item: 'none',
  },
  {
    code: 'GRAM.BA',
    domain: 'GRAM',
    en: '把 sentences',
    zh: '把字句',
    definition: 'A 把 sentence formed wrongly, or a 把 sentence needed but not used.',
    examples: ['*我放书在桌子上 → 我把书放在桌子上', '*我把作业做 → 我把作业做完了'],
    item: 'none',
  },
  {
    code: 'GRAM.BEI',
    domain: 'GRAM',
    en: '被 and the passive',
    zh: '被字句、被动',
    definition: 'A 被 sentence formed wrongly, or 被 used where Chinese uses a notional passive.',
    examples: ['*我的钱包被偷 → 我的钱包被偷了', '*这本书被写得很好 → 这本书写得很好'],
    item: 'none',
  },
  {
    code: 'GRAM.COMPAR',
    domain: 'GRAM',
    en: 'Comparisons',
    zh: '比较句',
    definition: 'Comparisons with 比, 跟……一样, 没有……那么.',
    examples: ['*他比我很高 → 他比我高得多', '*他比我不高 → 他没有我高'],
    item: 'none',
  },
  {
    code: 'GRAM.SHIDE',
    domain: 'GRAM',
    en: '是……的 (shì…de)',
    zh: '是……的',
    definition: 'The 是……的 construction for when, where or how something happened.',
    examples: ['*你什么时候来了？ → 你是什么时候来的？'],
    item: 'none',
  },
  {
    code: 'GRAM.SPECIAL',
    domain: 'GRAM',
    en: '是 / 有 / existential / double-object sentences',
    zh: '是字句、有字句、存现句、双宾语句',
    definition: '是 sentences, 有 sentences, existential sentences (place + 有 / 是 / verb + 着 + thing) and double-object sentences.',
    examples: ['*在桌子上有一本书 → 桌子上有一本书'],
    item: 'none',
  },
  {
    code: 'GRAM.SERIAL',
    domain: 'GRAM',
    en: 'Serial verbs & pivot sentences (请 / 叫 / 让 / 使)',
    zh: '连动句、兼语句',
    definition: 'Two verb phrases in a row (去商店买东西), and pivot sentences with 请 / 叫 / 让 / 使.',
    examples: ['*这件事使我很高兴了 → 这件事使我很高兴'],
    item: 'none',
  },
  {
    code: 'GRAM.NEG',
    domain: 'GRAM',
    en: 'Negation (不 / 没)',
    zh: '否定',
    definition: 'Choosing between 不 and 没, or placing the negation.',
    examples: ['*我昨天不去 → 我昨天没去'],
    item: 'none',
  },
  {
    code: 'GRAM.PREP',
    domain: 'GRAM',
    en: 'Preposition',
    zh: '介词',
    definition: 'The wrong preposition (在, 给, 跟, 对, 从, 离…). A preposition in the wrong position is GRAM.ORDER.',
    examples: ['*他给我很好 → 他对我很好'],
    item: 'pair',
  },
  {
    code: 'GRAM.ADV',
    domain: 'GRAM',
    en: 'Adverb (也/都/就/才/再/又/还)',
    zh: '副词',
    definition: 'The wrong adverb. An adverb in the wrong position is GRAM.ORDER.',
    examples: ['*我明天又去 → 我明天再去'],
    item: 'pair',
  },
  {
    code: 'GRAM.MODAL',
    domain: 'GRAM',
    en: 'Modal verb (会/能/可以/要/想)',
    zh: '能愿动词',
    definition: 'The wrong modal verb.',
    examples: ['*我今天病了，不会去上课 → 不能去上课'],
    item: 'pair',
  },
  {
    code: 'GRAM.PARTICLE',
    domain: 'GRAM',
    en: 'Sentence-final particles (吧 / 呢 / 啊 / 嘛)',
    zh: '语气词',
    definition: 'Sentence-final particles 吧, 呢, 啊, 嘛, 啦, 罢了 wrong, missing or extra. (吗 and question forms are GRAM.QUESTION; sentence-final 了 is GRAM.LE.)',
    examples: ['*你快来呢！ → 你快来吧！'],
    item: 'word',
  },
  {
    code: 'GRAM.QUESTION',
    domain: 'GRAM',
    en: 'Questions',
    zh: '疑问句',
    definition: 'Question forms: 吗, question words, A-not-A questions, 呢.',
    examples: ['*你去哪儿吗？ → 你去哪儿？'],
    item: 'none',
  },
  {
    code: 'GRAM.PRON',
    domain: 'GRAM',
    en: 'Pronouns',
    zh: '代词',
    definition: 'Personal and demonstrative pronouns: 自己, 咱们, 人家, 每, 各, 任何, 这么, 那样 …',
    examples: ['*每个人都有他们的爱好 → 每个人都有自己的爱好'],
    item: 'pair',
  },
  {
    code: 'GRAM.LOCATIVE',
    domain: 'GRAM',
    en: 'Locative words (上 / 里 / 以前)',
    zh: '方位词',
    definition: 'Locative words missing or wrong: 上, 里, 下, 中, 前, 后, 边, and frames like 在……上 / 在……以前.',
    examples: ['*我的书在桌子 → 我的书在桌子上'],
    item: 'pair',
  },
  {
    code: 'GRAM.NUM',
    domain: 'GRAM',
    en: 'Numbers, dates & time',
    zh: '数的表达',
    definition: 'Numbers (二 / 两), approximate numbers, ordinals, money, dates and clock times, fractions and multiples.',
    examples: ['*我有二个哥哥 → 我有两个哥哥'],
    item: 'pair',
  },
  {
    code: 'GRAM.REDUP',
    domain: 'GRAM',
    en: 'Reduplication',
    zh: '重叠',
    definition: 'Reduplicated verbs, adjectives, measure words and numeral + measure phrases (看看, 高高兴兴, 个个).',
    examples: ['*他高兴高兴地走了 → 他高高兴兴地走了'],
    item: 'word',
  },
  {
    code: 'GRAM.AFFIX',
    domain: 'GRAM',
    en: 'Affixes (们, 第, 老 …)',
    zh: '词缀（们、第、老、—子……）',
    definition: 'Prefixes and suffixes wrong, missing or extra, including plural 们 (*三个学生们).',
    examples: ['*我有三个好朋友们 → 我有三个好朋友'],
    item: 'word',
  },
  {
    code: 'GRAM.ORDER',
    domain: 'GRAM',
    en: 'Word order',
    zh: '语序',
    definition:
      'Word order that is not covered by a more specific code (time words, 在 + place, adverbs, descriptions before nouns).',
    examples: ['*我学习中文在大学 → 我在大学学习中文', '*我去北京明年 → 我明年去北京'],
    item: 'none',
  },
  {
    code: 'GRAM.CONSTIT',
    domain: 'GRAM',
    en: 'Missing or extra sentence part',
    zh: '句子成分残缺或多余',
    definition: 'A subject, verb or object is missing, or a word is extra (e.g. 是 before an adjective).',
    examples: ['*我是很高兴 → 我很高兴', '*我很喜欢中国菜，也日本菜 → 也喜欢日本菜'],
    item: 'none',
  },
  {
    code: 'GRAM.BLEND',
    domain: 'GRAM',
    en: 'Mixed-up structures',
    zh: '句式杂糅',
    definition: 'Two structures blended into one sentence.',
    examples: ['*我学中文的原因是因为…… → 我学中文是因为……'],
    item: 'none',
  },
  {
    code: 'GRAM.CONJ',
    domain: 'GRAM',
    en: 'Conjunctions within a sentence',
    zh: '句内连词和关联词',
    definition:
      'Conjunctions and paired connectives inside one sentence (和 joining verbs, 虽然……但是, 因为……所以). Between sentences is DISC.CONNECT.',
    examples: ['*我吃了饭和去了图书馆 → 我吃了饭，然后去了图书馆', '*虽然很累，所以…… → 虽然很累，但是……'],
    item: 'pair',
  },
  {
    code: 'GRAM.PHRASE',
    domain: 'GRAM',
    en: 'Phrase structure & type',
    zh: '短语结构、短语词性',
    definition: "The syllabus's phrase types: coordinate, modifier + head, verb + object, subject + predicate, appositive; noun, verb and adjective phrases.",
    examples: ['*我喜欢中国的文化和吃 → 我喜欢中国的文化和中国菜'],
    item: 'none',
  },
  {
    code: 'GRAM.FIXED',
    domain: 'GRAM',
    en: 'Fixed patterns & set phrases',
    zh: '固定格式、固定短语',
    definition: 'Fixed patterns, four-character frames, set phrases and discourse markers from the syllabus (除了……以外, 对……来说, 越来越, 换句话说 …) used wrongly or incompletely.',
    examples: ['*除了他，我们也都去了以外 → 除了他以外，我们也都去了'],
    item: 'none',
  },
  {
    code: 'GRAM.OTHER',
    domain: 'GRAM',
    en: 'Other grammar',
    zh: '其他语法',
    definition: 'Grammar that fits none of the codes above.',
    examples: [],
    item: 'none',
  },

  // ---- Punctuation ----------------------------------------------------------
  {
    code: 'PUNC.BOUNDARY',
    domain: 'PUNC',
    en: 'Sentence breaks',
    zh: '断句不当',
    definition: 'Commas run on where a sentence should end, or one idea is broken into many sentences.',
    examples: [],
    item: 'none',
  },
  {
    code: 'PUNC.MARK',
    domain: 'PUNC',
    en: 'Wrong punctuation mark',
    zh: '标点用错',
    definition: 'The wrong mark: 顿号 、 vs 逗号 ，, book-title marks 《》, quotation marks…',
    examples: ['苹果，香蕉 → 苹果、香蕉'],
    item: 'pair',
  },
  {
    code: 'PUNC.HALFWIDTH',
    domain: 'PUNC',
    en: 'English (half-width) punctuation',
    zh: '英文（半角）标点',
    definition: 'English punctuation , . ? used instead of Chinese ，。？ (counted once per essay).',
    examples: ['我喜欢中国,我想去北京. → ，。'],
    item: 'none',
  },

  // ---- Discourse -------------------------------------------------------------
  {
    code: 'DISC.CONNECT',
    domain: 'DISC',
    en: 'Linking sentences',
    zh: '句间衔接',
    definition: 'Connectives between sentences (across a full stop) missing, wrong or overused (e.g. 然后 everywhere).',
    examples: ['。和我们去了公园 → 。然后我们去了公园'],
    item: 'pair',
  },
  {
    code: 'DISC.REFER',
    domain: 'DISC',
    en: 'Repeated or unclear subject',
    zh: '指称',
    definition: 'A subject or pronoun repeated where Chinese leaves it out, or unclear who/what it refers to.',
    examples: ['*我很喜欢这个城市，我觉得我以后会再来 → 我很喜欢这个城市，以后还会再来'],
    item: 'none',
  },
  {
    code: 'DISC.COHERE',
    domain: 'DISC',
    en: 'Coherence',
    zh: '前后连贯',
    definition: 'Sentences that jump in meaning or contradict each other.',
    examples: [],
    item: 'none',
  },

  // ---- Register (acceptable Chinese, wrong for the text: "not natural" by default) --
  {
    code: 'REG.COLLOQ',
    domain: 'REG',
    en: 'Too colloquial for writing',
    zh: '口语用于书面',
    definition: 'Spoken words (挺, 特, 老, 啥, 咋, 嘛…) in a written or formal text.',
    examples: ['这个问题挺重要的 → 这个问题十分重要'],
    item: 'pair',
    nature: 'infelicity',
  },
  {
    code: 'REG.FORMAL',
    domain: 'REG',
    en: 'Formal-writing word patterns',
    zh: '书面语搭配规则',
    definition: 'Formal written patterns, e.g. 进行/加以 need a two-syllable verb after them.',
    examples: ['*进行学 → 进行学习'],
    item: 'pair',
    nature: 'infelicity',
  },
  {
    code: 'REG.PRAGMATIC',
    domain: 'REG',
    en: 'Politeness & appropriateness',
    zh: '得体、礼貌',
    definition: 'Too direct or impolite for the situation; wrong form of address.',
    examples: ['*给我你的电话 → 能告诉我您的电话吗？'],
    item: 'none',
    nature: 'infelicity',
  },

  // ---- Expression -----------------------------------------------------------
  {
    code: 'EXPR.NATURAL',
    domain: 'EXPR',
    en: 'More natural phrasing',
    zh: '表达不自然（没有错）',
    definition: 'Not wrong, but a native speaker would say it differently.',
    examples: [],
    item: 'none',
    nature: 'infelicity',
  },
];

export interface RuleInfo {
  id: string;
  code: string;
  en: string;
  zh: string;
  example: string;
}

/** Misuse rules: the usage condition a grammar error breaks. */
export const RULES: RuleInfo[] = [
  { id: 'R.LE.STATE', code: 'GRAM.LE', en: 'No 了 with states, adjectives or habits', zh: '状态、形容词、习惯性动作不用"了"', example: '*我昨天很累了 → 我昨天很累' },
  { id: 'R.LE.NEG', code: 'GRAM.LE', en: 'No 了 after 没 (negative sentences)', zh: '否定句不用"了"', example: '*我昨天没去了 → 我昨天没去' },
  { id: 'R.LE.BAREOBJ', code: 'GRAM.LE', en: "Verb + 了 + bare object can't end a sentence", zh: '"动词 + 了 + 简单宾语"不能结束句子', example: '*我吃了饭。 → 我吃饭了。' },
  { id: 'R.BA.NEEDED', code: 'GRAM.BA', en: 'Use 把 with verb + 在/到/给 + place or person', zh: '"动词 + 在/到/给 + 处所或对象"时要用把字句', example: '*我放书在桌子上 → 我把书放在桌子上' },
  { id: 'R.BA.VP', code: 'GRAM.BA', en: 'A 把 verb needs something after it', zh: '把字句的动词后面要有其他成分', example: '*我把作业做 → 我把作业做完了' },
  { id: 'R.BA.NEG_MODAL', code: 'GRAM.BA', en: 'Negation and modal verbs go before 把', zh: '否定词、能愿动词放在"把"前面', example: '*我把书没看完 → 我没把书看完' },
  { id: 'R.BEI.VP', code: 'GRAM.BEI', en: 'A 被 verb needs something after it', zh: '被字句的动词后面要有其他成分', example: '*我的钱包被偷 → 我的钱包被偷了' },
  { id: 'R.BEI.NOTIONAL', code: 'GRAM.BEI', en: 'No 被 for a notional passive', zh: '意义上的被动不用"被"', example: '*这本书被写得很好 → 这本书写得很好' },
  { id: 'R.COMPAR.DEGREE_ADV', code: 'GRAM.COMPAR', en: 'No 很/非常 in a 比 sentence', zh: '比字句里不用"很、非常"', example: '*他比我很高 → 他比我高得多' },
  { id: 'R.COMPAR.NEG', code: 'GRAM.COMPAR', en: 'Negate a comparison with 没有', zh: '比较的否定用"没有"', example: '*他比我不高 → 他没有我高' },
  { id: 'R.COMPAR.STRUCT', code: 'GRAM.COMPAR', en: 'Word order of 跟……一样', zh: '"跟……一样"的语序', example: '*他一样高跟我 → 他跟我一样高' },
  { id: 'R.COMP.OBJ_POS', code: 'GRAM.COMP', en: 'Where the object goes with a complement', zh: '带宾语时补语的位置', example: '*我看了书完 → 我看完了书' },
  { id: 'R.COMP.POTENTIAL', code: 'GRAM.COMP', en: 'Potential complement, not 能 + verb + complement', zh: '用可能补语，不用"能 + 动词 + 补语"', example: '*我不能听懂 → 我听不懂' },
  { id: 'R.COMP.DEGREE', code: 'GRAM.COMP', en: 'A degree complement needs 得', zh: '程度补语要用"得"，宾语提前或重复动词', example: '*我说中文很好 → 我中文说得很好' },
  { id: 'R.NEG.BU_MEI', code: 'GRAM.NEG', en: 'Use 没 for things that already happened', zh: '已经发生的事用"没"否定', example: '*我昨天不去 → 我昨天没去' },
  { id: 'R.Q.DOUBLE', code: 'GRAM.QUESTION', en: 'No 吗 after a question word or A-not-A', zh: '疑问词、正反问后面不再加"吗"', example: '*你去哪儿吗？ → 你去哪儿？' },
  { id: 'R.SHIDE.FOCUS', code: 'GRAM.SHIDE', en: '是……的 for when / where / how something happened', zh: '问已发生事情的时间、地点、方式用"是……的"', example: '*你什么时候来了？ → 你是什么时候来的？' },
  { id: 'R.ORDER.TIME', code: 'GRAM.ORDER', en: 'Time words go before the verb', zh: '时间词放在动词前面', example: '*我去北京明年 → 我明年去北京' },
  { id: 'R.ORDER.PLACE', code: 'GRAM.ORDER', en: '在 + place goes before the verb', zh: '"在 + 地点"放在动词前面', example: '*我学习中文在大学 → 我在大学学习中文' },
  { id: 'R.ORDER.ADVERB', code: 'GRAM.ORDER', en: 'Adverbs go before the verb', zh: '副词放在动词或动词短语前面', example: '*我喜欢也看书 → 我也喜欢看书' },
  { id: 'R.ORDER.ATTR', code: 'GRAM.ORDER', en: 'Descriptions go before the noun', zh: '定语放在名词前面', example: '*我买了一件衣服很漂亮 → 我买了一件很漂亮的衣服' },
  { id: 'R.CONSTIT.EXTRA_SHI', code: 'GRAM.CONSTIT', en: 'No 是 before an adjective', zh: '形容词谓语前面不用"是"', example: '*我是很高兴 → 我很高兴' },
];

export const NATURE_LABELS: Record<Nature, string> = {
  error: 'Error',
  infelicity: 'Not natural',
  variant: 'Variant (not wrong)',
};

export const DELETE_REASONS: { value: DeleteReason; label: string }[] = [
  { value: 'ai_wrong', label: 'The AI got it wrong' },
  { value: 'not_error', label: 'Not really an error' },
  { value: 'not_now', label: "Not focusing on this now" },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const CODE_MAP = new Map(CODES.map((c) => [c.code, c]));
const RULE_MAP = new Map(RULES.map((r) => [r.id, r]));
const DOMAIN_MAP = new Map(DOMAINS.map((d) => [d.id, d]));

export const CODE_IDS = CODES.map((c) => c.code);
/** Codes the AI may use. */
export const AI_CODE_IDS = CODES.filter((c) => c.ai !== false).map((c) => c.code);
export const RULE_IDS = RULES.map((r) => r.id);

export function getCode(code: string | null | undefined): CodeInfo | undefined {
  return code ? CODE_MAP.get(code) : undefined;
}

export function getRule(rule: string | null | undefined): RuleInfo | undefined {
  return rule ? RULE_MAP.get(rule) : undefined;
}

export function getDomain(domain: Domain): DomainInfo {
  return DOMAIN_MAP.get(domain)!;
}

export function isCode(v: unknown): v is string {
  return typeof v === 'string' && CODE_MAP.has(v);
}

export function rulesFor(code: string | null | undefined): RuleInfo[] {
  return code ? RULES.filter((r) => r.code === code) : [];
}

/** The rule, if it belongs to the code. */
export function ruleForCode(code: string | null | undefined, rule: unknown): string | null {
  const r = typeof rule === 'string' ? RULE_MAP.get(rule) : undefined;
  return r && r.code === code ? r.id : null;
}

/** error_tags.error_type for a code. */
export function errorTypeFor(code: string): ErrorType {
  const c = CODE_MAP.get(code);
  return c ? getDomain(c.domain).errorType : 'grammar';
}

export function defaultNature(code: string | null | undefined): Nature {
  return getCode(code)?.nature ?? 'error';
}

export function codesByDomain(): { domain: DomainInfo; codes: CodeInfo[] }[] {
  return DOMAINS.map((domain) => ({ domain, codes: CODES.filter((c) => c.domain === domain.id) }));
}

export function isNature(v: unknown): v is Nature {
  return v === 'error' || v === 'infelicity' || v === 'variant';
}

export function isSeverity(v: unknown): v is Severity {
  return v === 'global' || v === 'local';
}

export function isDeleteReason(v: unknown): v is DeleteReason {
  return v === 'ai_wrong' || v === 'not_error' || v === 'not_now';
}

// ---------------------------------------------------------------------------
// Items and names
// ---------------------------------------------------------------------------

export interface LabelLike {
  code?: string | null;
  rule?: string | null;
  /** HSK syllabus grammar point (lib/hsk-grammar), e.g. H25-1-025. */
  grammar_point?: string | null;
  item_target?: string | null;
  item_learner?: string | null;
  custom_label?: string | null;
  pattern_name?: string | null;
  error_type?: string | null;
}

/** "认识 ← 知道", "+了", "−了"; '' when the label records no words. */
export function itemText(t: Pick<LabelLike, 'item_target' | 'item_learner'>): string {
  const target = (t.item_target ?? '').trim();
  const learner = (t.item_learner ?? '').trim();
  if (target && learner) return `${target} ← ${learner}`;
  if (target) return `+${target}`;
  if (learner) return `−${learner}`;
  return '';
}

/** The words a label records ('' when its code records none, or none were given). */
function wordsLabel(c: CodeInfo, t: LabelLike): string {
  if (c.item === 'none') return '';
  if (c.item === 'word') return (t.item_target ?? '').trim() || (t.item_learner ?? '').trim();
  return itemText(t);
}

/**
 * What exactly went wrong, without the code: a misuse rule, else the words,
 * else the HSK grammar point ('' when the label names none of them).
 */
export function itemLabel(t: LabelLike): string {
  const rule = getRule(t.rule);
  if (rule) return rule.en;
  const c = getCode(t.code);
  if (!c) return '';
  const words = wordsLabel(c, t);
  if (words) return words;
  const gp = getGrammarPoint(t.grammar_point);
  return gp ? grammarPointName(gp) : '';
}

/** Name of a label as people see it. */
export function tagLabel(t: LabelLike): string {
  const custom = (t.custom_label ?? '').trim();
  if (custom) return custom;
  const c = getCode(t.code);
  if (!c) return (t.pattern_name ?? '').trim() || t.error_type || '';
  const item = itemLabel(t);
  return item ? `${c.en} · ${item}` : c.en;
}

/** Stored in error_tags.pattern_name for older readers: same label → same text, always. */
export function canonicalPatternName(t: LabelLike): string {
  const c = getCode(t.code);
  if (!c) return (t.pattern_name ?? '').trim();
  const item = itemLabel(t);
  return (item ? `${c.en} · ${item}` : c.en).slice(0, 80);
}

/** The family a label is counted under: its code, or (older labels) its type + name. */
export function familyKey(t: LabelLike): string {
  if (getCode(t.code)) return t.code!;
  return `legacy:${t.error_type ?? ''}:${(t.pattern_name ?? '').trim()}`;
}

/** Name of a family. */
export function familyLabel(t: LabelLike): string {
  const c = getCode(t.code);
  return c ? c.en : (t.pattern_name ?? '').trim() || t.error_type || 'Other';
}

/** Key of the exact item within its family ('' when the label names no item). Same key ⇔ same itemLabel. */
export function itemKey(t: LabelLike): string {
  const c = getCode(t.code);
  if (!c) return '';
  if (getRule(t.rule)) return t.rule!;
  const words = wordsLabel(c, t);
  if (words) return `${c.item}:${words}`;
  return getGrammarPoint(t.grammar_point) ? `gp:${t.grammar_point}` : '';
}

/** Removal of a word or a swap, from what the student wrote to the fix. */
export function operationFor(learner: string | null | undefined, target: string | null | undefined): Operation | null {
  const l = (learner ?? '').trim();
  const r = (target ?? '').trim();
  if (!l && !r) return null;
  if (!l) return 'missing';
  if (!r) return 'unnecessary';
  if (l !== r && l.length === r.length && [...l].sort().join('') === [...r].sort().join('')) return 'order';
  return 'replace';
}

/** True for labels the teacher has checked (or added, or kept when releasing the feedback). */
export function isConfirmed(t: { status?: string | null; source?: string | null }): boolean {
  if (t.status === 'confirmed' || t.status === 'accepted' || t.status === 'modified' || t.status === 'added') return true;
  // Older labels have no status: the teacher's own ones were added by hand
  return !t.status && t.source === 'teacher';
}

/** True for AI labels nobody has checked yet. */
export function isUnconfirmedAi(t: { status?: string | null }): boolean {
  return t.status === 'suggested';
}

/** True for labels that count (not removed by the teacher). */
export function isActive(t: { status?: string | null }): boolean {
  return t.status !== 'deleted';
}
