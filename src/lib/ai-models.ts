/**
 * Request settings that depend on the OpenAI model, and what each call used.
 *
 * Reasoning models (the o-series, GPT-5 and later — e.g. gpt-5.6-luna,
 * gpt-6-luna) think before they answer. They take no temperature; instead
 * they take a reasoning effort: more thinking is slower and costs more (the
 * thinking is billed as output). Older models (gpt-4o-mini, gpt-4.1-mini)
 * take a temperature.
 */

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

const EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high'];

export function isReasoningEffort(v: unknown): v is ReasoningEffort {
  return typeof v === 'string' && (EFFORTS as string[]).includes(v);
}

/** o1, o3, o4-mini, gpt-5…, gpt-6…: models that reason before answering. */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-([5-9]|\d{2,}))/.test(model);
}

/**
 * Effort for reasoning models when none is given (OPENAI_REASONING_EFFORT,
 * else low): short thinking keeps the student's wait short.
 */
export function defaultReasoningEffort(): ReasoningEffort {
  const env = process.env.OPENAI_REASONING_EFFORT?.trim();
  return isReasoningEffort(env) ? env : 'low';
}

/** temperature for older models; reasoning_effort for reasoning models. */
export function samplingParams(model: string, temperature: number, effort?: ReasoningEffort): Record<string, unknown> {
  if (!isReasoningModel(model)) return { temperature };
  return { reasoning_effort: effort ?? defaultReasoningEffort() };
}

/** What one call used. */
export interface AiUsage {
  model: string;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  /** Part of completionTokens spent thinking (reasoning models). */
  reasoningTokens: number;
  ms: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Reads the token counts from a Chat Completions response. */
export function usageFrom(data: unknown, model: string, ms: number): AiUsage {
  const u = (data as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const prompt = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const completion = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  return {
    model,
    promptTokens: num(u.prompt_tokens),
    cachedTokens: num(prompt.cached_tokens),
    completionTokens: num(u.completion_tokens),
    reasoningTokens: num(completion.reasoning_tokens),
    ms,
  };
}

/** US$ per 1M tokens (OpenAI list prices, checked October 2026). */
export const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cached: 0.025, output: 0.4 },
  'gpt-5.6-luna': { input: 0.2, cached: 0.02, output: 1.2 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
};

/** Cost of one call in US$, or null when the model's price isn't known. */
export function costOf(usage: AiUsage): number | null {
  const p = PRICES[usage.model];
  if (!p) return null;
  const fresh = Math.max(0, usage.promptTokens - usage.cachedTokens);
  return (fresh * p.input + usage.cachedTokens * p.cached + usage.completionTokens * p.output) / 1_000_000;
}
