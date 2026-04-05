import { AIFeedbackResponse, ErrorPattern } from '@/types';

export async function generateFeedback(
  text: string,
  errorPatterns: ErrorPattern[],
  previousSubmissionCount: number
): Promise<AIFeedbackResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const isFirstSubmission = previousSubmissionCount === 0;

  let historyContext = '';
  if (!isFirstSubmission && errorPatterns.length > 0) {
    historyContext = `\n\nIMPORTANT — This student has ${previousSubmissionCount} previous submissions. Here are their SPECIFIC past errors. Check if any of these SAME mistakes appear in the current composition:\n`;
    for (const p of errorPatterns.slice(0, 10)) {
      historyContext += `\n[${p.pattern_name}] (${p.error_type}, appeared ${p.count}x before)`;
      for (const ex of p.examples.slice(0, 2)) {
        historyContext += `\n  - "${ex.original}" → "${ex.revision}"`;
      }
    }
    historyContext += `\n\nFor repeated_error_summary: ONLY mention errors that ACTUALLY appear again in this composition. Be specific: "You wrote X again — last time you also wrote X instead of Y. Remember the rule: ..." If no past errors are repeated, set repeated_error_summary to "".\n`;
  }

  const prompt = `You are a professional Chinese language writing teacher for American college students learning Chinese. Analyze this composition thoroughly.

STUDENT'S COMPOSITION:
${text}
${historyContext}

Provide feedback as JSON with this EXACT structure:

{
  "overall_comment": "2-3 sentence assessment",
  "strengths": ["specific strength 1", "specific strength 2"],
  "content_feedback": "Assess the IDEAS: Is the main argument clear? Are there enough supporting examples? Is the reasoning logical? Are ideas developed or shallow? Provide specific suggestions. If the composition is too short for meaningful content analysis, note that.",
  "structure_feedback": "Assess the ORGANIZATION: Is there a clear beginning/middle/end? Are transitions used between ideas (e.g., 首先/其次/另外/总之)? Does the writing flow logically? Are paragraphs well-structured? Give specific suggestions.",
  "main_problems": ["specific problem 1", "specific problem 2"],
  "sentence_revisions": [
    {
      "original": "Chinese sentence with error",
      "revised": "Corrected Chinese sentence",
      "explanation": "Clear English explanation"
    }
  ],
  "error_tags": [
    {
      "error_type": "characters|vocabulary|grammar|content|structure|punctuation",
      "pattern_name": "A short, specific name for this error pattern in English, e.g. '了 usage', 'comparison word order', '在...看来 expression', 'missing topic sentence', 'wrong measure word'. This must be specific enough to track across submissions.",
      "original_text": "Chinese text with error",
      "suggested_revision": "Corrected Chinese",
      "explanation": "English explanation of what's wrong",
      "improvement_tip": "A clear rule or tip the student can study. E.g. 'Rule: Use 在...看来 (not 在...看) to express opinions. Pattern: 在 + person + 看来，...sentence.' Include the grammar pattern or usage rule.",
      "sentence_index": 0
    }
  ],
  "repeated_error_summary": "${isFirstSubmission ? '' : 'ONLY if the student repeats a SPECIFIC past error in this composition. Reference the exact error. Otherwise empty string.'}",
  "next_step_advice": "Reference SPECIFIC errors from this composition with CONCRETE practice tasks. E.g.: 'Practice the pattern 在...看来 by writing 3 sentences expressing different opinions. Review the difference between 生钱 (earn money) and 省钱 (save money) — write a paragraph using both correctly.'"
}

RULES:
1. error_type must be one of: characters, vocabulary, grammar, content, structure, punctuation
2. pattern_name must be SPECIFIC and CONSISTENT — the same error should always get the same pattern_name
3. content_feedback and structure_feedback are REQUIRED — always provide substantive analysis
4. improvement_tip should contain an actual RULE or PATTERN the student can study
5. Include 2-5 sentence_revisions
6. All explanations in English; Chinese only in original/revised fields
7. ${isFirstSubmission ? 'This is the FIRST submission — set repeated_error_summary to ""' : 'Only mention recurring errors if the SAME specific mistake appears again'}
8. Return valid JSON only`;

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
