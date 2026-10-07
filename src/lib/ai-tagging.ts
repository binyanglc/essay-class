/**
 * Labels the AI's corrections with the fixed label list (lib/error-taxonomy).
 *
 * Runs after the corrections are made and anchored, as its own step: the AI
 * sees each correction (what the student wrote → the fix, and the exact
 * changes) and must pick codes from the list — it can't invent names. For
 * each label it first writes down the exact words and what is wrong, then
 * picks the code (the answer is generated in that order), with worked
 * examples in the prompt.
 *
 * The result is checked here:
 *   - rules must belong to their code; quoted words must be in the sentence;
 *   - changes that can only mean one thing are labelled by rule, overriding
 *     the AI (lib/label-rules: ±了, 的/地/得, same-sounding characters,
 *     English punctuation) — the AI's own answer stays in ai_original;
 *   - every correction gets a label: skipped ones are asked about again, and
 *     still-unlabelled ones get a rule-based label when their changes allow;
 *   - English punctuation counts once per essay.
 */

import type { CorrectionLevel } from '@/types';
import { containsLoosely } from './track-changes';
import {
  AI_CODE_IDS,
  CODES,
  DOMAINS,
  RULES,
  RULE_IDS,
  TAXONOMY_VERSION,
  canonicalPatternName,
  defaultNature,
  errorTypeFor,
  getCode,
  isNature,
  isSeverity,
  operationFor,
  ruleForCode,
} from './error-taxonomy';
import type { Nature, Operation, Severity } from './error-taxonomy';
import { RULE_KIND_CODE, changesAt, coreOf, isLeAfterMei, ruleKind } from './label-rules';
import type { PositionedChange, RuleKind } from './label-rules';

/**
 * Default model for labelling (override with OPENAI_TAGGING_MODEL).
 * With the rules and worked examples, gpt-4o-mini labelled all 12 test
 * sentences right (as gpt-4.1-mini did) at about a third of the price.
 */
export const TAGGING_MODEL = 'gpt-4o-mini';
/** Used when the model set in OPENAI_TAGGING_MODEL isn't available to this API key. */
export const FALLBACK_TAGGING_MODEL = 'gpt-4o-mini';

export interface RevisionForTagging {
  id: string;
  original: string;
  revised: string;
  explanation?: string;
}

/** One change inside a correction: the student's words → the replacement ('' = nothing). */
export interface Change {
  learner: string;
  target: string;
}

/** A label as the AI returns it (before checking). */
export interface RawLabel {
  revision: number;
  learner_text: string;
  target_text: string;
  /** A few words on what is wrong — written before the code is chosen. */
  problem?: string;
  code: string;
  rule: string | null;
  nature: string;
  severity: string;
  note: string;
}

/** An error_tags row for a new AI label (submission_id / student_id are added by the caller). */
export interface AiTagRow {
  error_type: string;
  code: string;
  rule: string | null;
  item_target: string | null;
  item_learner: string | null;
  nature: Nature;
  severity: Severity | null;
  operation: Operation | null;
  pattern_name: string;
  original_text: string;
  suggested_revision: string;
  explanation: string;
  improvement_tip: string;
  sentence_index: null;
  source: 'ai';
  status: 'suggested';
  revision_id: string;
  ai_original: Record<string, unknown>;
  taxonomy_version: string;
  model: string;
}

/** The separate changes in a correction, in order. */
export function changesIn(original: string, revised: string): Change[] {
  return changesAt(original, revised).map(({ learner, target }) => ({ learner, target }));
}

function describeChange(c: Change): string {
  if (c.learner && c.target) return `${c.learner}→${c.target}`;
  if (c.target) return `+${c.target}`;
  return `−${c.learner}`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function codebookText(): string {
  const lines: string[] = [];
  for (const d of DOMAINS) {
    lines.push(`\n${d.en.toUpperCase()} (${d.zh})`);
    for (const c of CODES.filter((x) => x.domain === d.id && x.ai !== false)) {
      const ex = c.examples.length ? ` Examples: ${c.examples.join('; ')}` : '';
      lines.push(`- ${c.code} — ${c.en} / ${c.zh}: ${c.definition}${ex}`);
    }
  }
  return lines.join('\n');
}

function rulesText(): string {
  return RULES.map((r) => `- ${r.id} (${r.code}): ${r.en} / ${r.zh}. e.g. ${r.example}`).join('\n');
}

/** Worked examples: student → corrected ⇒ the labels (learner_text / target_text / code / rule). */
const EXAMPLES = `
1. 我明天在来。 → 我明天再来。
   ⇒ "在" / "再" — 在 and 再 are both read zài: a same-sounding character ⇒ CHAR.SOUND
2. 我昨天没去了。 → 我昨天没去。
   ⇒ "了" / "" — extra 了 in a sentence negated with 没 ⇒ GRAM.LE, rule R.LE.NEG   (not GRAM.NEG: 没 was right)
3. 我昨天很累了。 → 我昨天很累。
   ⇒ "了" / "" — 了 after an adjective describing a past state ⇒ GRAM.LE, rule R.LE.STATE
4. 他跑的很快。 → 他跑得很快。
   ⇒ "的" / "得" — 得 before a degree complement ⇒ GRAM.DE
5. 我放书在桌子上。 → 我把书放在桌子上。
   ⇒ "放书在" / "把书放在" — verb + 在 + place needs a 把 sentence ⇒ GRAM.BA, rule R.BA.NEEDED   (one label for the whole change)
6. 你什么时候来了？ → 你是什么时候来的？
   ⇒ "来了" / "是什么时候来的" — asking when a past event happened ⇒ GRAM.SHIDE, rule R.SHIDE.FOCUS   (not GRAM.LE)
7. 我知道他三年了。 → 我认识他三年了。
   ⇒ "知道" / "认识" — 认识 is for knowing a person ⇒ VOC.CHOICE
8. 我喜欢穿帽子。 → 我喜欢戴帽子。
   ⇒ "穿" / "戴" — right meaning, wrong partner for 帽子 ⇒ VOC.COLLOC
9. 我学习中文在大学。 → 我在大学学习中文。
   ⇒ "学习中文在大学" / "在大学学习中文" — 在 + place moved before the verb ⇒ GRAM.ORDER, rule R.ORDER.PLACE   (GRAM.ORDER only when words MOVE)
10. 我喜欢中国,我想去北京. → 我喜欢中国，我想去北京。
   ⇒ ",.", "，。" — English punctuation ⇒ PUNC.HALFWIDTH   (one label)
11. 这个问题挺重要的。 → 这个问题十分重要。
   ⇒ "挺" / "十分" — 挺 is spoken style ⇒ REG.COLLOQ, nature "infelicity"
12. 我很喜欢这个城市，我觉得我以后会再来。 → 我很喜欢这个城市，以后还会再来。
   ⇒ "我觉得我" / "" — the subject is repeated where Chinese leaves it out ⇒ DISC.REFER, nature "infelicity"`;

const LEVEL_NOTE: Record<CorrectionLevel, string> = {
  essential: 'The teacher asked for ESSENTIAL corrections only, so every correction fixes a real error: use nature "error".',
  standard:
    'STANDARD corrections: most fix errors ("error"); a few fix clearly unnatural phrasing that is not ungrammatical ("infelicity").',
  detailed:
    'DETAILED corrections: besides errors ("error"), many only make phrasing more natural — those are "infelicity" (use EXPR.NATURAL when no more specific code fits).',
};

function buildPrompt(revisions: RevisionForTagging[], level: CorrectionLevel, onlyMissing: boolean): string {
  const list = revisions
    .map((r, i) => {
      const changes = changesIn(r.original, r.revised).map(describeChange).join('; ');
      const why = r.explanation ? `\n    Explanation: ${r.explanation.replace(/\s+/g, ' ').slice(0, 600)}` : '';
      return `[${i + 1}] Student wrote: ${r.original}\n    Corrected: ${r.revised}\n    Changes: ${changes || '(none)'}${why}`;
    })
    .join('\n');

  return `You label corrections made to a composition by an American college student learning Chinese.
Choose labels ONLY from this list (codes are exact):
${codebookText()}

MISUSE RULES (optional detail for some grammar codes — use one only when it clearly fits that code):
${rulesText()}

HOW TO DECIDE
1. A wrong character with the same or similar sound → CHAR.SOUND; similar shape → CHAR.SHAPE (even if the wrong character is also a word, e.g. 在/再, 做/作, 那/哪). Exception: 的/地/得 → GRAM.DE.
2. Adding or removing 了 is ALWAYS GRAM.LE (never GRAM.NEG or GRAM.CONSTIT). With 没 in the clause, the rule is R.LE.NEG.
3. Missing/extra/swapped characters: if what the student wrote is not a word (图馆) → CHAR.INWORD; if it is another real word (兴趣 → 感兴趣) → a vocabulary or grammar code.
4. If the fix introduces or removes a construction (把, 被, 是……的, 比), use that construction's code even if 了 etc. also changed.
5. GRAM.ORDER only when words move to another place. Prefer a specific code over GRAM.ORDER, GRAM.CONSTIT or GRAM.OTHER.
6. Connectives inside one sentence → GRAM.CONJ; between sentences (across 。！？) → DISC.CONNECT.
7. The word itself means the wrong thing → VOC.CHOICE; the meaning is right but it doesn't go with its neighbours → VOC.COLLOC.
8. One change with two problems → two labels. One problem causing several changes (e.g. moving words) → one label.
9. Nature: "error" = ungrammatical or wrong; "infelicity" = acceptable but unnatural (REG.* and EXPR.NATURAL are normally "infelicity"); "variant" = a regional or script variant that is not wrong.
   ${LEVEL_NOTE[level]}
10. Traditional characters used consistently are not an error.
11. Severity: "global" if the original would confuse a reader; otherwise "local".

WORKED EXAMPLES
${EXAMPLES}

FOR EACH LABEL, in this order
- revision: the correction's number in brackets.
- learner_text: the shortest part of "Student wrote" that is wrong (a character, word or particle), copied exactly; "" if something was missing.
- target_text: what replaces it in "Corrected", copied exactly; "" if it was simply removed.
- problem: a few words on what exactly is wrong (e.g. "在 and 再 sound the same", "extra 了 after 没").
- code: the label that matches the problem.
- rule: a misuse rule id from the list for this code, or null.
- note: one short sentence in English for the student, about this label only.
${onlyMissing ? '\nThese corrections were left without a label before: give EVERY one of them at least one label.\n' : '\nGive EVERY correction at least one label.\n'}
CORRECTIONS
${list}`;
}

const NULLABLE_RULE = { anyOf: [{ type: 'string', enum: RULE_IDS }, { type: 'null' }] };

// Property order matters: the model writes the words and the problem before it chooses the code
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['revision', 'learner_text', 'target_text', 'problem', 'code', 'rule', 'nature', 'severity', 'note'],
        properties: {
          revision: { type: 'integer' },
          learner_text: { type: 'string' },
          target_text: { type: 'string' },
          problem: { type: 'string' },
          code: { type: 'string', enum: AI_CODE_IDS },
          rule: NULLABLE_RULE,
          nature: { type: 'string', enum: ['error', 'infelicity', 'variant'] },
          severity: { type: 'string', enum: ['global', 'local'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

export interface TaggingOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

/** Which model to use: option → OPENAI_TAGGING_MODEL → default. */
export function taggingModel(opts: TaggingOptions = {}): string {
  return opts.model ?? (process.env.OPENAI_TAGGING_MODEL?.trim() || TAGGING_MODEL);
}

/** Reasoning models (o-series, GPT-5) only accept the default temperature. */
const fixedTemperature = (model: string) => /^(o\d|gpt-5)/.test(model);

async function requestLabels(
  revisions: RevisionForTagging[],
  level: CorrectionLevel,
  onlyMissing: boolean,
  opts: TaggingOptions,
  model: string
): Promise<{ labels: RawLabel[]; model: string }> {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      ...(fixedTemperature(model) ? {} : { temperature: 0 }),
      messages: [
        {
          role: 'system',
          content:
            'You are an expert teacher of Chinese as a second language. You classify corrections with a fixed list of error labels. Be consistent: the same kind of problem always gets the same code.',
        },
        { role: 'user', content: buildPrompt(revisions, level, onlyMissing) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'error_labels', strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // The chosen model isn't available to this key: use the fallback once
    if ((res.status === 404 || (res.status === 400 && /model/i.test(body))) && model !== FALLBACK_TAGGING_MODEL) {
      console.error(`Labelling model ${model} unavailable (${res.status}); using ${FALLBACK_TAGGING_MODEL}`);
      return requestLabels(revisions, level, onlyMissing, opts, FALLBACK_TAGGING_MODEL);
    }
    throw new Error(`OpenAI API error: ${res.status} ${body}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? JSON.parse(content) : null;
  return { labels: Array.isArray(parsed?.labels) ? (parsed.labels as RawLabel[]) : [], model };
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

const clean = (s: unknown, max = 40) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/** Picks the change a label is about: the one inside its quoted words, else the first unused one of its kind. */
function matchChange(
  rev: RevisionForTagging,
  changes: PositionedChange[],
  used: Set<PositionedChange>,
  learner: string,
  kind: RuleKind
): PositionedChange | undefined {
  const sameKind = changes.filter((c) => !used.has(c) && ruleKind(c.learner, c.target) === kind);
  const p = learner ? rev.original.indexOf(learner) : -1;
  if (p >= 0) {
    const inside = sameKind.find((c) => c.at >= p && c.at <= p + learner.length);
    if (inside) return inside;
  }
  return sameKind[0];
}

function row(
  rev: RevisionForTagging,
  code: string,
  rule: string | null,
  learner: string,
  target: string,
  nature: Nature,
  severity: Severity | null,
  note: string,
  aiOriginal: Record<string, unknown>,
  model: string
): AiTagRow {
  const info = getCode(code)!;
  const itemTarget = info.item === 'none' ? null : target || null;
  const itemLearner = info.item === 'pair' ? learner || null : null;
  return {
    error_type: errorTypeFor(code),
    code,
    rule,
    item_target: itemTarget,
    item_learner: itemLearner,
    nature,
    severity,
    operation: operationFor(learner, target),
    pattern_name: canonicalPatternName({ code, rule, item_target: itemTarget, item_learner: itemLearner }),
    original_text: rev.original,
    suggested_revision: rev.revised,
    explanation: note,
    improvement_tip: '',
    sentence_index: null,
    source: 'ai',
    status: 'suggested',
    revision_id: rev.id,
    ai_original: aiOriginal,
    taxonomy_version: TAXONOMY_VERSION,
    model,
  };
}

/** For a change the rules decide alone: code, rule and the words to record. */
function ruleBased(rev: RevisionForTagging, change: PositionedChange, kind: RuleKind, aiRule: string | null) {
  const code = RULE_KIND_CODE[kind];
  const core = coreOf(change.learner, change.target);
  let rule: string | null = null;
  if (kind === 'LE') {
    if (isLeAfterMei(rev.original, change)) rule = 'R.LE.NEG';
    else {
      const r = ruleForCode(code, aiRule);
      rule = r === 'R.LE.NEG' ? null : r; // "after 没" only when there is a 没
    }
  }
  if (kind === 'HALFWIDTH') return { code, rule, learner: change.learner.trim(), target: change.target.trim() };
  return { code, rule, learner: core.learner, target: core.target };
}

/**
 * Turns the AI's labels into rows to save. Labels for unknown corrections or
 * codes are dropped; quoted words that aren't in the sentence are replaced by
 * the correction's own change when there is only one; changes the rules
 * decide alone get the rule's label.
 */
export function checkLabels(
  raw: RawLabel[],
  revisions: RevisionForTagging[],
  level: CorrectionLevel,
  model: string = TAGGING_MODEL
): AiTagRow[] {
  const rows: AiTagRow[] = [];
  const seen = new Set<string>();
  const changesFor = new Map(revisions.map((r) => [r.id, changesAt(r.original, r.revised)]));
  const used = new Map(revisions.map((r) => [r.id, new Set<PositionedChange>()]));

  for (const l of raw) {
    const rev = Number.isInteger(l.revision) ? revisions[l.revision - 1] : undefined;
    let code = getCode(l.code);
    if (!rev || !code || code.ai === false) continue;
    const changes = changesFor.get(rev.id)!;

    let learner = clean(l.learner_text);
    let target = clean(l.target_text);
    if (learner && !containsLoosely(rev.original, learner)) learner = '';
    if (target && !containsLoosely(rev.revised, target)) target = '';
    if (!learner && !target && changes.length === 1) {
      learner = changes[0].learner.trim().slice(0, 40);
      target = changes[0].target.trim().slice(0, 40);
    }

    let rule = ruleForCode(code.code, l.rule);
    const aiOriginal: Record<string, unknown> = {
      code: l.code,
      rule: l.rule,
      learner_text: l.learner_text,
      target_text: l.target_text,
      problem: l.problem,
      nature: l.nature,
      severity: l.severity,
      note: l.note,
    };

    // Changes that can only mean one thing get the rule's label
    const kind = ruleKind(learner, target);
    let at = -1;
    if (kind) {
      const change = matchChange(rev, changes, used.get(rev.id)!, learner, kind) ?? {
        learner,
        target,
        at: Math.max(0, rev.original.indexOf(learner)),
      };
      used.get(rev.id)!.add(change);
      at = change.at;
      const fixed = ruleBased(rev, change, kind, l.rule);
      if (fixed.code !== code.code || fixed.rule !== rule) aiOriginal.overridden_by_rule = kind;
      code = getCode(fixed.code)!;
      rule = fixed.rule;
      learner = fixed.learner;
      target = fixed.target;
    }

    let nature: Nature = isNature(l.nature) ? l.nature : defaultNature(code.code);
    if (code.nature) nature = code.nature; // register / expression: "not natural" unless the teacher says otherwise
    if (kind) nature = 'error';
    if (level === 'essential' && nature === 'infelicity') nature = 'error';

    const r = row(rev, code.code, rule, learner, target, nature, isSeverity(l.severity) ? l.severity : null, clean(l.note, 400), aiOriginal, model);
    // Same label for the same words is one label; the same rule-decided change twice (two 了) is two
    const key = [rev.id, r.code, r.rule ?? '', learner, target, at].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }

  return oneHalfWidthPerEssay(rows);
}

/** English punctuation is one habit, not one error per comma: keep one label per essay. */
function oneHalfWidthPerEssay(rows: AiTagRow[]): AiTagRow[] {
  let halfWidthSeen = false;
  return rows.filter((r) => {
    if (r.code !== 'PUNC.HALFWIDTH') return true;
    if (halfWidthSeen) return false;
    halfWidthSeen = true;
    return true;
  });
}

/** Labels for a correction from the rules alone — when every change in it is one they decide. */
export function ruleLabels(rev: RevisionForTagging, model: string): AiTagRow[] {
  const changes = changesAt(rev.original, rev.revised);
  if (changes.length === 0) return [];
  const kinds = changes.map((c) => ruleKind(c.learner, c.target));
  if (kinds.some((k) => !k)) return [];
  return changes.map((c, i) => {
    const f = ruleBased(rev, c, kinds[i]!, null);
    return row(rev, f.code, f.rule, f.learner, f.target, 'error', 'local', '', { rule_only: kinds[i] }, model);
  });
}

/**
 * Labels every correction. Corrections the AI skipped are asked about once
 * more; if that fails or they are still skipped, the rules label the ones
 * whose changes they decide alone.
 */
export async function tagRevisions(
  revisions: RevisionForTagging[],
  level: CorrectionLevel,
  opts: TaggingOptions = {}
): Promise<AiTagRow[]> {
  const usable = revisions.filter((r) => r.id && r.original.trim() && r.original !== r.revised);
  if (usable.length === 0) return [];

  const first = await requestLabels(usable, level, false, opts, taggingModel(opts));
  const rows = checkLabels(first.labels, usable, level, first.model);

  const covered = () => new Set(rows.map((r) => r.revision_id));
  let missing = usable.filter((r) => !covered().has(r.id));
  if (missing.length > 0) {
    try {
      const again = await requestLabels(missing, level, true, opts, first.model);
      rows.push(...checkLabels(again.labels, missing, level, again.model));
    } catch (err) {
      console.error('AI tagging retry failed:', err);
    }
    missing = usable.filter((r) => !covered().has(r.id));
    for (const rev of missing) rows.push(...ruleLabels(rev, first.model));
  }
  return oneHalfWidthPerEssay(rows);
}

