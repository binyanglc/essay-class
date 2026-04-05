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

  const prompt = `You are a Chinese language writing teacher for American college students. Analyze this composition thoroughly.

STUDENT'S COMPOSITION:
${text}
${historyContext}

Return a JSON object with this EXACT structure:

{
  "overall_comment": "2-3 sentence overall assessment. Mention what the student did well AND main areas for improvement.",
  "sentence_revisions": [
    {
      "original": "Original Chinese sentence with error",
      "revised": "Corrected Chinese sentence",
      "explanation": "Clear English explanation of what was wrong and why"
    }
  ],
  "characters_comment": "1-2 sentence comment on character usage. If there ARE character errors, briefly summarize the issue (e.g. 'You confused 在 and 再 — pay attention to these similar-looking characters.'). If there are NO character errors, give specific praise referencing the composition (e.g. 'All characters are written correctly, including some advanced ones like 虽然 and 虽.'). Be specific to THIS composition, not generic.",
  "vocabulary_comment": "1-2 sentence comment on vocabulary. If there ARE vocabulary errors, briefly summarize (e.g. 'Watch out for word choice — you used 生钱 instead of 省钱.'). If there are NO vocabulary errors, praise specifically (e.g. 'Good use of vocabulary like 方便 and 节约, appropriate for this topic.'). Reference actual words from the composition.",
  "grammar_comment": "1-2 sentence comment on grammar. If there ARE grammar errors, briefly summarize (e.g. 'You have some word order issues in comparison sentences.'). If there are NO grammar errors, praise specifically (e.g. 'Your sentence structures are accurate — nice use of 虽然...但是 and 不但...而且.'). Reference actual patterns from the composition.",
  "content_feedback": "Assess the IDEAS and CONTENT: Is the main argument clear? Are there enough supporting details or examples? Is the reasoning logical? Are ideas developed enough or too shallow? Provide specific, actionable suggestions.",
  "structure_feedback": "Assess ORGANIZATION and STRUCTURE: Is there a clear beginning, middle, and end? Are transitions used between ideas (e.g., 首先、其次、另外、总之)? Does the writing flow logically? Also note any PUNCTUATION issues (wrong punctuation marks, missing punctuation, etc.).",
  "error_tags": [
    {
      "error_type": "characters|vocabulary|grammar",
      "pattern_name": "A short, specific name for this error pattern, e.g. '了 usage', 'word order in comparison', '在...看来 expression', 'wrong measure word', 'similar-looking characters'. Must be specific enough to track across submissions.",
      "original_text": "Chinese text with error",
      "suggested_revision": "Corrected Chinese",
      "explanation": "English explanation",
      "improvement_tip": "A concrete rule or tip. E.g. 'Rule: 在 + person + 看来 means in someone's opinion. Pattern: 在我看来，...' Include the grammar pattern or usage rule so students can study it.",
      "sentence_index": 0
    }
  ]
}

CLASSIFICATION RULES for error_tags:
- "characters": Wrong Chinese character used (e.g. writing 在 instead of 再, handwriting errors, similar-looking character confusion). If no character errors exist, do NOT include any "characters" entries.
- "vocabulary": Wrong word choice, wrong measure word, incorrect collocations, using a word with the wrong meaning
- "grammar": Word order errors, incorrect use of particles (了/过/着/的/得/地), missing or wrong prepositions, sentence structure errors

IMPORTANT:
- content_feedback and structure_feedback are REQUIRED — always provide substantive analysis
- Include punctuation feedback inside structure_feedback
- error_tags should ONLY use types: characters, vocabulary, grammar
- All explanations in English; Chinese only in original/revised text fields
- Include 2-5 sentence_revisions covering the most important corrections
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
          content: 'You are a Chinese writing teacher for American students. Return JSON only. Be specific and pedagogically useful.',
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
