import { AIFeedbackResponse, ErrorFrequency } from '@/types';

export async function generateFeedback(
  text: string,
  errorHistory: ErrorFrequency[],
  previousSubmissionCount: number
): Promise<AIFeedbackResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const isFirstSubmission = previousSubmissionCount === 0;

  const historyContext = !isFirstSubmission && errorHistory.length > 0
    ? `\n\nThis student has submitted ${previousSubmissionCount} previous compositions. Their recurring error patterns are:\n${errorHistory
        .slice(0, 8)
        .map((e) => `- ${e.error_type}: appeared ${e.count} times across past submissions`)
        .join('\n')}\n\nPlease specifically address these recurring patterns in your feedback.`
    : '';

  const recurringInstruction = isFirstSubmission
    ? '\n\nThis is the student\'s FIRST submission. Set "repeated_error_summary" to an empty string "" since there is no prior history.'
    : '\n\nThis student has prior submissions. In "repeated_error_summary", specifically name which error types have appeared before and how many times. For example: "You have made vocabulary errors in 3 of your last 4 submissions. Grammar issues with 了 have appeared twice before."';

  const prompt = `You are a professional Chinese language writing teacher. Your students are American learners of Chinese. Analyze the following Chinese composition and provide structured feedback.

IMPORTANT: All explanations, comments, and advice must be in ENGLISH. Chinese text should only appear in "original" and "revised" fields.

Student's composition:
${text}
${historyContext}

ERROR CATEGORIES — you must ONLY use these 6 types. Classify carefully:
- "vocabulary" — wrong word, wrong collocation, unnatural word choice, wrong measure word
- "grammar" — wrong sentence pattern, wrong use of 了/的/地/得, word order errors, missing or extra grammatical elements
- "content" — weak argument, unclear ideas, lack of examples, off-topic, shallow analysis
- "structure" — poor organization, missing introduction/conclusion, weak transitions between ideas, paragraph issues
- "characters" — wrong Chinese character, typo, homophone error
- "punctuation" — wrong or missing punctuation marks

CLASSIFICATION RULES:
- If a word is used in the wrong context, that's "vocabulary", NOT "grammar"
- 了/的/地/得 errors are "grammar" only if the grammatical particle itself is wrong
- If the essay lacks a clear argument or examples, that's "content"
- If transitions between paragraphs are weak, that's "structure"
- When in doubt between categories, choose the most specific one
${recurringInstruction}

Return feedback in this exact JSON format:
{
  "overall_comment": "2-3 sentence assessment in English",
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "main_problems": ["Specific problem 1", "Specific problem 2"],
  "sentence_revisions": [
    {
      "original": "Original Chinese sentence with error",
      "revised": "Corrected Chinese sentence",
      "explanation": "Clear explanation in English of what was wrong and why the correction is better"
    }
  ],
  "error_tags": [
    {
      "error_type": "vocabulary|grammar|content|structure|characters|punctuation",
      "original_text": "Chinese text with error",
      "suggested_revision": "Corrected Chinese text",
      "explanation": "Explanation in English",
      "sentence_index": 0
    }
  ],
  "repeated_error_summary": "${isFirstSubmission ? '' : 'Summary of recurring patterns from past submissions'}",
  "next_step_advice": "Specific, actionable advice referencing the actual errors found. For example: Practice using 在...看来 instead of 在...看 for expressing opinions. Review the difference between 生钱 and 省钱. Try rewriting paragraph 2 with a clearer topic sentence."
}

Requirements:
1. Return valid JSON only
2. error_type MUST be one of the 6 categories listed above
3. Include 2-5 sentence_revisions
4. next_step_advice must reference SPECIFIC errors found in this composition with CONCRETE practice suggestions
5. All explanations in English; Chinese only in original/revised fields`;

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
          content: 'You are a Chinese writing teacher for American students. Return JSON only. All explanations in English. Classify errors carefully into the correct category.',
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
