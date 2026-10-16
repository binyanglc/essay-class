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
 * adds a hint per correction that teaches the fix — the right word or pattern,
 * how two similar words differ — without writing the corrected sentence, and
 * keeps corrected sentences out of the comments. lib/hints double-checks both
 * before anything is saved.
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
      `      "explanation": "Detailed English explanation — see EXPLANATION RULES below",\n      "hint": ["For the student: one item per problem — see HINT RULES below"]\n    }`
    )
    .replace(
      important,
      `HINT RULES (this teacher chose "hints only": the student will NOT see "revised" or "explanation" — only the marked places, their type and your hint. The student must rewrite the sentence on their own, so the hint has to TEACH exactly what they need to fix it. A vague hint like "check the word choice" does not help):
1. "hint" is a JSON array with ONE item per problem, in the order the problems come in the sentence (one item if there is one problem). Never put two problems in one item. No numbers or bullets.
2. Start each item with the student's own words that it is about, in Chinese (for something missing, say where: "Before 在: …"). Then be specific:
   - Wrong word (two similar words): name the student's word AND the right word, and contrast them — what each one means or goes with — with a short phrase for each that is NOT from this sentence.
   - Wrong character: name the right character and contrast it with the one written: what each character means, with a common word for each.
   - Grammar: name the exact pattern to use, written as a structure with placeholders, e.g. "不但 A，而且 B", "无论 A 还是 B，都……", "难道……吗", "正在 + verb", "verb + 得 + description", and say in a few words what it does.
   - Missing or extra word: say which word is missing or not needed, and the rule.
   - Word order: give the right order as a structure with placeholders, e.g. "subject + time word + verb" — never filled in with words from this sentence.
   - You may add a short example, but it must be a NEW phrase or sentence, not from this composition.
   - If the right word or pattern is probably new to the student, give its pinyin and meaning (the student won't see the explanation).
   - Never just say "X is wrong, use Y instead": always say HOW the two differ, so the student learns when to use each. Not helpful: "改善 is wrong; use 提高 instead." Helpful: the first example below.
3. NEVER write the corrected sentence or any corrected part of it: do not put the right word or pattern together with the student's other words from this sentence. Putting them together is the student's job.
4. Each item is 1–2 short sentences in plain English at the student's level. Write all Chinese in characters (pinyin may follow in parentheses).
Examples (original → revised: hint):
- 他的汉语水平改善了很多 → 他的汉语水平提高了很多:
  ["改善 vs 提高: 改善 means to make a bad situation better (改善环境、改善关系); 提高 means to raise a level or an ability (提高成绩、提高能力)."]
- 我很喜换中文 → 我很喜欢中文:
  ["喜换: 'to like' is written with 欢 (happy, as in 欢迎), not 换 (to exchange, as in 换钱)."]
- 我们玩了很快乐 → 我们玩得很快乐:
  ["了: to describe how an action went, use verb + 得 + description (他跑得很快). 了 only says the action is finished."]
- 我去了学校昨天 → 我昨天去了学校:
  ["昨天: time words go before the verb in Chinese: subject + time word + verb (他明天来)."]
- 无论天气好或不好，他每天跑步 → 无论天气好不好，他每天都跑步:
  ["好或不好: after 无论, give the choices as a question — A 还是 B, or the positive and negative together (忙不忙、远不远) — not with 或.", "Before 跑步: 无论 needs 都 in the second part: 无论……，subject + 都 + verb."]

COMMENTS for this student: sum up the kinds of problems and the rules (the hints already give the details). Never write a corrected sentence or a corrected part of the composition, and don't word corrections as instructions like "change X to Y".

${important}`
    );
}
