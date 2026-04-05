import { AIFeedbackResponse, ErrorPattern } from '@/types';

export async function generateFeedback(
  text: string,
  errorPatterns: ErrorPattern[],
  previousSubmissionCount: number
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

  const prompt = `You are a Chinese language writing teacher for American college students learning Chinese. Analyze this composition thoroughly.

STUDENT'S COMPOSITION:
${text}
${historyContext}

Return a JSON object with this EXACT structure:

{
  "overall_comment": "2-3 sentence overall assessment. Mention what the student did well AND main areas for improvement.",
  "sentence_revisions": [
    {
      "original": "Original Chinese sentence with error(s)",
      "revised": "Corrected Chinese sentence",
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
      "original_text": "Chinese text with error",
      "suggested_revision": "Corrected Chinese",
      "explanation": "English explanation",
      "improvement_tip": "Concrete rule or grammar pattern the student can study",
      "sentence_index": 0
    }
  ]
}

EXPLANATION RULES for sentence_revisions (VERY IMPORTANT):
1. If a sentence has MULTIPLE errors, explain ALL of them. Number each error clearly:
   "(1) '生钱' should be '省钱' — 生 means 'give birth/raw', 省 means 'save'. (2) The word order is wrong: in Chinese, time words come before the verb, so '每天' should be placed before '可以'. (3) Missing '了' after '搬' to indicate completed action."
2. When the revised sentence uses vocabulary or grammar the student may not know, TEACH it:
   "The revised sentence uses '不仅...而且...' (not only...but also...) — this is a common pattern to connect two related advantages. 不仅 introduces the first point, 而且 introduces the second."
3. Keep revisions at the student's approximate level. Do NOT rewrite sentences with vocabulary far beyond what they used. If you must use a new word/pattern, explain it clearly.
4. Be thorough: every change between the original and revised sentence must be explained. Do not leave any correction unexplained.

CLASSIFICATION RULES for error_tags:
- "characters": Wrong Chinese character (e.g. 在 instead of 再). If none, omit.
- "vocabulary": Wrong word choice, wrong measure word, incorrect collocations
- "grammar": Word order, particles (了/过/着/的/得/地), prepositions, sentence structure

IMPORTANT:
- sentence_revisions: include 3-6 revisions covering the most important sentences
- Revisions should match the student's level — don't introduce HSK6 vocabulary for a beginner
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
          content: 'You are a Chinese writing teacher for American students. Return JSON only. Be thorough, specific, and pedagogically useful. When correcting sentences, explain EVERY change you make and teach any new vocabulary or grammar you introduce.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
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
