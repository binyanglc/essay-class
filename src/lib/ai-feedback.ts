import { AIFeedbackResponse, ErrorFrequency } from '@/types';

export async function generateFeedback(
  text: string,
  errorHistory: ErrorFrequency[]
): Promise<AIFeedbackResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const historyContext =
    errorHistory.length > 0
      ? `\n\nThis student's past error patterns (pay special attention to recurring errors):\n${errorHistory
          .slice(0, 8)
          .map((e) => `- ${e.error_type}: appeared ${e.count} times`)
          .join('\n')}`
      : '';

  const prompt = `You are a professional Chinese language writing teacher. Your students are American learners of Chinese. Analyze the following Chinese composition and provide structured feedback.

IMPORTANT: All explanations, comments, and advice must be in ENGLISH so the student can understand. Chinese text should only appear in the "original" and "revised" fields showing the actual Chinese sentences.

Student's composition:
${text}
${historyContext}

Return feedback in the following JSON format:
{
  "overall_comment": "Overall assessment in English (2-3 sentences)",
  "strengths": ["Strength 1 in English", "Strength 2 in English"],
  "main_problems": ["Main problem 1 in English", "Main problem 2 in English"],
  "sentence_revisions": [
    {
      "original": "Original Chinese sentence",
      "revised": "Corrected Chinese sentence",
      "explanation": "Explanation in English of what was wrong and why"
    }
  ],
  "error_tags": [
    {
      "error_type": "vocabulary_word_choice|collocation|grammar_le|grammar_de|word_order|punctuation|coherence_transition|register_style|character_error|other",
      "original_text": "Original Chinese text fragment",
      "suggested_revision": "Corrected Chinese text",
      "explanation": "Explanation in English",
      "sentence_index": 0
    }
  ],
  "repeated_error_summary": "Summary in English of recurring errors (if student has error history, explicitly point out repeated patterns)",
  "next_step_advice": "Advice in English for next steps"
}

Requirements:
1. Return valid JSON only, no other text
2. error_type must be one of the specified types
3. Include 2-5 specific sentence_revisions
4. All explanations in ENGLISH, all Chinese text only in original/revised fields
5. If student has recurring errors, emphasize them in repeated_error_summary`;

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
          content: 'You are a Chinese writing teacher for American students. Return JSON only, no other content. All explanations must be in English.',
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
