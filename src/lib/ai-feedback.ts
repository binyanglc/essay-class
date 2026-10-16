import { AIFeedbackResponse, CorrectionLevel, ErrorPattern } from '@/types';
import { courseLevel, hskLabel, hskRange, levelCeiling, withArticle } from '@/types';
import type { FeedbackStyle, StudentLevel } from '@/types';
import { samplingParams, usageFrom } from './ai-models';
import type { AiUsage, ReasoningEffort } from './ai-models';

/** The model that writes the corrections and comments (override with OPENAI_FEEDBACK_MODEL). */
export const FEEDBACK_MODEL = 'gpt-4o-mini';

export interface FeedbackOptions {
  model?: string;
  /** For reasoning models only (see lib/ai-models). */
  reasoningEffort?: ReasoningEffort;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** Told the tokens and time the call used. */
  onUsage?: (usage: AiUsage) => void;
  /** "hints": the student won't see the corrections — also write a hint per correction, and no corrected sentences in comments. */
  style?: FeedbackStyle;
  /** The students' HSK level (migration v18): correct with words and grammar at this level or below. */
  studentLevel?: StudentLevel | null;
}

/** Which model writes the feedback: option → OPENAI_FEEDBACK_MODEL → default. */
export function feedbackModel(opts: FeedbackOptions = {}): string {
  return opts.model ?? (process.env.OPENAI_FEEDBACK_MODEL?.trim() || FEEDBACK_MODEL);
}

const LEVEL_RULES: Record<CorrectionLevel, string> = {
  essential:
    'ESSENTIAL — correct only clear mistakes: wrong characters, grammar errors, wrong words or collocations, and punctuation errors. If a sentence is grammatical and a Chinese teacher would understand it, leave it alone, even if it sounds a little foreign. No style improvements.',
  standard:
    'STANDARD — correct all mistakes (characters, grammar, word choice, collocations, punctuation) and phrasing that is clearly unnatural or confusing. Leave sentences that are acceptable for a learner at this level unchanged, even if a native speaker might phrase them differently. No style polishing.',
  detailed:
    "DETAILED — correct all mistakes, and also improve phrasing that is grammatical but sounds unnatural or translated from English, using words the student likely knows. Keep the student's ideas and sentence structure.",
};

const LEVEL_DESCRIPTIONS: Record<StudentLevel, string> = {
  '1': 'a beginner who knows only basic words and grammar',
  '2': 'a beginner who knows only basic words and grammar',
  '3': 'an intermediate learner',
  '4': 'an intermediate learner',
  '5': 'an upper-intermediate learner',
  '6': 'an upper-intermediate learner',
  '7-9': 'an advanced learner',
  beginner: 'a beginner who knows only basic words and grammar',
  intermediate: 'an intermediate learner',
  advanced: 'an advanced learner',
};

/**
 * The students' level, when the teacher set one: corrections stay within it,
 * so a basic composition isn't "upgraded" with words the student hasn't
 * learned. Without a level the prompt is exactly as before.
 */
export function levelRules(studentLevel: StudentLevel): string {
  // A kind of course stands for two HSK levels; corrections stay within the higher one
  const hsk = hskLabel(levelCeiling(studentLevel));
  const course = courseLevel(studentLevel);
  const level = course ? `${withArticle(course.label.toLowerCase())} course, roughly ${hskRange(studentLevel)}` : hsk;
  return `STUDENT LEVEL: ${level} on the new 9-level HSK (HSK 3.0, 2025 syllabus) — ${LEVEL_DESCRIPTIONS[studentLevel]}. Match every correction to this level:
1. Keep the student's own words and sentence patterns whenever they can be made correct, even words above ${hsk} that the student chose.
2. When you must add or replace a word, use the simplest word that fixes the problem, at ${hsk} or below, even if a more advanced word would sound more natural.
3. Use only grammar patterns at ${hsk} or below. Do not add patterns the student has probably not learned yet.
4. Do not revise a sentence just to use more advanced words or patterns: a correct sentence with simple words is good writing at this level.
5. If nothing at ${hsk} or below can fix a problem, use the simplest option and say in the explanation that it is a new word or pattern, with its pinyin and meaning.
6. Write explanations and comments in plain English that a student at this level can follow.
These rules take priority over any example in this prompt that uses more advanced words or patterns.`;
}

export async function generateFeedback(
  text: string,
  errorPatterns: ErrorPattern[],
  previousSubmissionCount: number,
  level: CorrectionLevel = 'standard',
  opts: FeedbackOptions = {}
): Promise<AIFeedbackResponse> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const model = feedbackModel(opts);

  let historyContext = '';
  if (previousSubmissionCount > 0 && errorPatterns.length > 0) {
    historyContext = `\n\nThis student has ${previousSubmissionCount} previous submissions. Here are their past error patterns for reference:\n`;
    for (const p of errorPatterns.slice(0, 10)) {
      historyContext += `\n[${p.pattern_name}] (${p.error_type}, appeared ${p.count}x before)`;
      for (const ex of p.examples.slice(0, 2)) {
        historyContext += `\n  - "${ex.original}" → "${ex.revision}"`;
      }
    }
  }

  let prompt = `You are a Chinese language writing teacher for American college students learning Chinese. Analyze this composition.

STUDENT'S COMPOSITION:
${text}
${historyContext}

CORRECTION LEVEL: ${LEVEL_RULES[level]}${opts.studentLevel ? `\n\n${levelRules(opts.studentLevel)}` : ''}

Return a JSON object with this EXACT structure:

{
  "overall_comment": "2-3 sentence overall assessment. Mention what the student did well AND main areas for improvement.",
  "sentence_revisions": [
    {
      "original": "A sentence copied EXACTLY from the composition (same characters and punctuation)",
      "revised": "The same sentence with only the necessary corrections",
      "explanation": "Detailed English explanation — see EXPLANATION RULES below"
    }
  ],
  "characters_comment": "1-2 sentence comment on character usage, specific to this composition. If errors: summarize. If no errors: praise with specific characters from the text.",
  "vocabulary_comment": "1-2 sentence comment on vocabulary, specific to this composition. If errors: summarize. If no errors: praise with specific words from the text.",
  "grammar_comment": "1-2 sentence comment on grammar, specific to this composition. If errors: summarize. If no errors: praise with specific patterns from the text.",
  "content_feedback": "Assess IDEAS and CONTENT: Is the main argument clear? Enough supporting details? Reasoning logical? Provide specific suggestions.",
  "structure_feedback": "Assess ORGANIZATION and STRUCTURE: Clear beginning/middle/end? Transitions used? Also note any PUNCTUATION issues."
}

SENTENCE REVISION RULES (VERY IMPORTANT — the revisions are shown inside the full composition, like track changes):
1. Go through the composition sentence by sentence, in order. Include EVERY sentence that needs a correction at the correction level above, and ONLY those. Sentences that are already acceptable must not appear.
2. "original" must be copied character-for-character from the composition — same characters, same punctuation — so it can be found in the text. One whole sentence (or clause) per item; a sentence may continue across a line break.
3. Make the smallest change that fixes each problem. Keep the student's words, sentence structure and ideas. Do not rewrite sentences in your own style and do not replace correct words with fancier ones.
4. Keep revisions at the student's level — no vocabulary far beyond what they used. If you must use a new word or pattern, explain it.
5. Keep the student's script: if they write traditional characters, correct in traditional characters. Never convert between traditional and simplified.

EXPLANATION RULES for sentence_revisions:
1. If a sentence has MULTIPLE errors, explain ALL of them. Number each error clearly:
   "(1) '生钱' should be '省钱' — 生 means 'give birth/raw', 省 means 'save'. (2) The word order is wrong: in Chinese, time words come before the verb, so '每天' should be placed before '可以'. (3) Missing '了' after '搬' to indicate completed action."
2. When the revised sentence uses vocabulary or grammar the student may not know, TEACH it:
   "The revised sentence uses '不仅...而且...' (not only...but also...) — this is a common pattern to connect two related advantages. 不仅 introduces the first point, 而且 introduces the second."
3. Every change between the original and revised sentence must be explained. Do not leave any correction unexplained.

IMPORTANT:
- sentence_revisions may be an empty array if nothing needs correcting at this level
- content_feedback and structure_feedback are REQUIRED
- Write explanations and comments in English, but write every Chinese character, word or sentence you mention in Chinese characters (in the student's script), as in the examples above. Never use pinyin alone; pinyin may follow in parentheses. Example: "Replace 要 with 希望", not "Replace yao with xiwang".
- Return valid JSON only`;

  if (opts.style === 'hints') prompt = withHintRules(prompt);

  const started = Date.now();
  const response = await (opts.fetchImpl ?? fetch)('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a Chinese writing teacher for American students. Return JSON only. Be accurate and pedagogically useful: correct what needs correcting at the requested level, leave acceptable sentences alone, and explain every change you make.',
        },
        { role: 'user', content: prompt },
      ],
      // temperature 0.3, or a reasoning effort for models that think first
      ...samplingParams(model, 0.3, opts.reasoningEffort),
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  opts.onUsage?.(usageFrom(data, model, Date.now() - started));
  const content = data.choices[0].message.content;
  return JSON.parse(content) as AIFeedbackResponse;
}

/**
 * "Hints only" assignments: the student sees where each problem is, but never
 * the revised sentence or the explanation (those are for the teacher). The AI
 * explanation is written as always (the student sees it too, as the "hint");
 * the AI adds "usage & examples" per problem — the right word or pattern,
 * phrases and an example, with pinyin and English, never the corrected
 * sentence — and keeps corrected sentences out of the comments. lib/hints
 * double-checks all of them before anything is saved.
 */
export function withHintRules(prompt: string): string {
  const schemaLine = `      "explanation": "Detailed English explanation — see EXPLANATION RULES below"\n    }`;
  const important = `IMPORTANT:\n- sentence_revisions may be an empty array`;
  // The general rule's example is itself a correction; give one that isn't
  const scriptExample = `Example: "Replace 要 with 希望", not "Replace yao with xiwang".`;
  if (!prompt.includes(schemaLine) || !prompt.includes(important) || !prompt.includes(scriptExample)) {
    throw new Error('Feedback prompt changed: update withHintRules');
  }
  return prompt
    .replace(scriptExample, `Example: "完 doesn't fit here", not "wan doesn't fit here".`)
    .replace(
      schemaLine,
      `      "explanation": "Detailed English explanation — see EXPLANATION RULES below",\n      "hint": ["Usage & examples for the student: one object per problem — see HINT RULES below"]\n    }`
    )
    .replace(
      important,
      `HINT RULES (this teacher chose "hints only": the student will NOT see "revised" and must rewrite the sentence on their own). Your explanation says what is wrong and why. The "hint" is "usage & examples": it gives the student the words, phrases and an example they need to fix each problem — don't repeat the explanation.
1. "hint" is a JSON array with ONE object per problem, in the same order as the explanation:
   {"student_words": "…", "right": {"zh": "…", "pinyin": "…", "en": "…"}, "compare": {"zh": "…", "pinyin": "…", "en": "…"} or null, "phrases": [{"zh": "…", "pinyin": "…", "en": "…"}, …], "example": {"zh": "…", "pinyin": "…", "en": "…"}}
2. "student_words": the student's own words the problem is about, copied from the sentence (for something missing, say where: "Before 跑步").
3. "right": the right word, character or pattern. A pattern is written with placeholders: "不但 A，而且 B", "verb + 得 + description", "subject + time word + verb".
4. "compare": when the student used a real word or character that means something else, that word, so the two can be told apart; otherwise null.
5. "phrases": two or three common collocations or short phrases with the right word or pattern. A fixed frame with the student's own words is fine when the other words are left out with ……: "同意……的看法". [] if nothing fits (e.g. punctuation).
6. "example": one short, NEW example sentence using it.
7. Every "zh" gets "pinyin" (with tone marks; leave out placeholders like A, B, verb) and a short, plain "en".
8. Phrases and the example must be NEW — not copied from this composition — and use words at the student's level. NEVER write the corrected sentence.
Examples (original → revised: hint):
- 他的汉语水平改善了很多 → 他的汉语水平提高了很多:
  [{"student_words": "改善", "right": {"zh": "提高", "pinyin": "tígāo", "en": "to raise, improve (a level or ability)"}, "compare": {"zh": "改善", "pinyin": "gǎishàn", "en": "to make a bad situation better"}, "phrases": [{"zh": "提高成绩", "pinyin": "tígāo chéngjì", "en": "improve one's grades"}, {"zh": "提高能力", "pinyin": "tígāo nénglì", "en": "improve one's ability"}, {"zh": "改善环境", "pinyin": "gǎishàn huánjìng", "en": "improve the environment"}], "example": {"zh": "我想提高我的口语。", "pinyin": "Wǒ xiǎng tígāo wǒ de kǒuyǔ.", "en": "I want to improve my speaking."}}]
- 我去了学校昨天 → 我昨天去了学校:
  [{"student_words": "昨天", "right": {"zh": "subject + time word + verb", "pinyin": "", "en": "time words go before the verb"}, "compare": null, "phrases": [{"zh": "明天去", "pinyin": "míngtiān qù", "en": "go tomorrow"}, {"zh": "晚上见", "pinyin": "wǎnshang jiàn", "en": "see you this evening"}], "example": {"zh": "我明天去北京。", "pinyin": "Wǒ míngtiān qù Běijīng.", "en": "I'm going to Beijing tomorrow."}}]
- 无论天气好或不好，他每天跑步 → 无论天气好不好，他每天都跑步:
  [{"student_words": "好或不好", "right": {"zh": "无论 A 还是 B", "pinyin": "wúlùn … háishi …", "en": "no matter whether A or B"}, "compare": {"zh": "或", "pinyin": "huò", "en": "or (in statements, not after 无论)"}, "phrases": [{"zh": "无论忙不忙", "pinyin": "wúlùn máng bu máng", "en": "whether busy or not"}, {"zh": "无论你还是我", "pinyin": "wúlùn nǐ háishi wǒ", "en": "whether you or me"}], "example": {"zh": "无论你去还是不去，我都去。", "pinyin": "Wúlùn nǐ qù háishi bú qù, wǒ dōu qù.", "en": "Whether you go or not, I'm going."}}, {"student_words": "Before 跑步", "right": {"zh": "无论……，subject + 都 + verb", "pinyin": "wúlùn …, … dōu …", "en": "no matter …, still …"}, "compare": null, "phrases": [{"zh": "都要去", "pinyin": "dōu yào qù", "en": "will go anyway"}], "example": {"zh": "无论多忙，他都学习。", "pinyin": "Wúlùn duō máng, tā dōu xuéxí.", "en": "However busy he is, he studies."}}]

COMMENTS for this student: sum up the kinds of problems and the rules (the explanations and hints already give the details). Never write a corrected sentence or a corrected part of the composition, and don't word corrections as instructions like "change X to Y".

${important}`
    );
}
