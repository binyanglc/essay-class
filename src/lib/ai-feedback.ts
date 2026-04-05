import { AIFeedbackResponse, ErrorFrequency } from '@/types';

export async function generateFeedback(
  text: string,
  errorHistory: ErrorFrequency[]
): Promise<AIFeedbackResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const historyContext =
    errorHistory.length > 0
      ? `\n\n该学生的历史错误模式（请特别关注反复出现的错误）：\n${errorHistory
          .slice(0, 8)
          .map((e) => `- ${e.error_type}: 已出现${e.count}次`)
          .join('\n')}`
      : '';

  const prompt = `你是一位专业的中文写作教师。请分析以下中文作文并提供结构化反馈。

作文内容：
${text}
${historyContext}

请以JSON格式返回反馈，严格遵循以下结构：
{
  "overall_comment": "整体评价（2-3句话）",
  "strengths": ["优点1", "优点2"],
  "main_problems": ["主要问题1", "主要问题2"],
  "sentence_revisions": [
    {
      "original": "原句",
      "revised": "修改后",
      "explanation": "修改原因"
    }
  ],
  "error_tags": [
    {
      "error_type": "vocabulary_word_choice|collocation|grammar_le|grammar_de|word_order|punctuation|coherence_transition|register_style|character_error|other",
      "original_text": "原文片段",
      "suggested_revision": "修改建议",
      "explanation": "解释",
      "sentence_index": 0
    }
  ],
  "repeated_error_summary": "对重复出现的错误进行总结和提醒",
  "next_step_advice": "下一步改进建议"
}

要求：
1. 只返回有效JSON，不要包含其他文本
2. error_type只能是规定类型之一
3. sentence_revisions至少包含2-5个具体修改建议
4. 如果有历史重复错误，在repeated_error_summary中明确指出`;

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
          content: '你是中文写作教师。只返回JSON，不要有其他内容。',
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
