import { AIFeedbackResponse, CorrectionLevel, ErrorPattern } from '@/types';
import type { FeedbackStyle } from '@/types';
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
  /** "hints": the student won't see the corrections — also write a hint per correction, and no answers in comments. */
  style?: FeedbackStyle;
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

CORRECTION LEVEL: ${LEVEL_RULES[level]}

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
 * adds one hint per correction, and keeps answers out of the comments.
 * lib/hints double-checks both before anything is saved.
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
      `      "explanation": "Detailed English explanation — see EXPLANATION RULES below",\n      "hint": "ONE short sentence for the student — see HINT RULES below"\n    }`
    )
    .replace(
      important,
      `HINT RULES (this teacher chose "hints only": the student will NOT see "revised" or "explanation" — only where the problem is, its type and your hint; the student must fix it themselves):
1. Point to the kind of problem and the rule, or ask a guiding question. Do NOT give the answer: never write the corrected sentence, and never write any character or word that your correction adds or uses instead of the student's.
2. You may quote the student's own words in Chinese characters.
3. One sentence, in English, at the student's level.
Examples (original → revised: hint):
- 我们玩了很快乐 → 我们玩得很快乐: "Which 'de' joins a verb to a description of how the action went?"
- 她的实习很快完了 → 她的实习很快就要结束了: "完 doesn't fit an internship coming to an end — which verb is used when a period of time or an event finishes?"
- 我去了学校昨天 → 我昨天去了学校: "Where do time words go in a Chinese sentence?"
- 我昨天去商店 → 我昨天去了商店: "This action is already finished — something is missing after the verb."

COMMENTS for this student: describe the kinds of problems and the rules, but never write corrected sentences or the right words.

${important}`
    );
}
