import { AIFeedbackResponse, CorrectionLevel, ErrorPattern } from '@/types';

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
  level: CorrectionLevel = 'standard'
): Promise<AIFeedbackResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

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

  const prompt = `You are a Chinese language writing teacher for American college students learning Chinese. Analyze this composition.

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
  "structure_feedback": "Assess ORGANIZATION and STRUCTURE: Clear beginning/middle/end? Transitions used? Also note any PUNCTUATION issues.",
  "error_tags": [
    {
      "error_type": "characters|vocabulary|grammar",
      "pattern_name": "Short specific name, e.g. '了 usage', 'word order in comparison'",
      "original_text": "Chinese text with error, copied exactly from the composition",
      "suggested_revision": "Corrected Chinese",
      "explanation": "English explanation",
      "improvement_tip": "Concrete rule or grammar pattern the student can study",
      "sentence_index": 0
    }
  ]
}

SENTENCE REVISION RULES (VERY IMPORTANT — the revisions are shown inside the full composition, like track changes):
1. Go through the composition sentence by sentence, in order. Include EVERY sentence that needs a correction at the correction level above, and ONLY those. Sentences that are already acceptable must not appear.
2. "original" must be copied character-for-character from the composition — same characters, same punctuation — so it can be found in the text. One whole sentence (or clause) per item; a sentence may continue across a line break.
3. Make the smallest change that fixes each problem. Keep the student's words, sentence structure and ideas. Do not rewrite sentences in your own style and do not replace correct words with fancier ones.
4. Keep revisions at the student's level — no vocabulary far beyond what they used. If you must use a new word or pattern, explain it.

EXPLANATION RULES for sentence_revisions:
1. If a sentence has MULTIPLE errors, explain ALL of them. Number each error clearly:
   "(1) '生钱' should be '省钱' — 生 means 'give birth/raw', 省 means 'save'. (2) The word order is wrong: in Chinese, time words come before the verb, so '每天' should be placed before '可以'. (3) Missing '了' after '搬' to indicate completed action."
2. When the revised sentence uses vocabulary or grammar the student may not know, TEACH it:
   "The revised sentence uses '不仅...而且...' (not only...but also...) — this is a common pattern to connect two related advantages. 不仅 introduces the first point, 而且 introduces the second."
3. Every change between the original and revised sentence must be explained. Do not leave any correction unexplained.

CLASSIFICATION RULES for error_tags:
- "characters": Wrong Chinese character (e.g. 在 instead of 再). If none, omit.
- "vocabulary": Wrong word choice, wrong measure word, incorrect collocations
- "grammar": Word order, particles (了/过/着/的/得/地), prepositions, sentence structure
- Only real errors — never tag a style suggestion.

IMPORTANT:
- sentence_revisions may be an empty array if nothing needs correcting at this level
- content_feedback and structure_feedback are REQUIRED
- error_tags: ONLY types characters, vocabulary, grammar
- All explanations in English; Chinese only in original/revised text
- Return valid JSON only`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a Chinese writing teacher for American students. Return JSON only. Be accurate and pedagogically useful: correct what needs correcting at the requested level, leave acceptable sentences alone, and explain every change you make.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content) as AIFeedbackResponse;
}
