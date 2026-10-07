'use client';

import { useState } from 'react';
import type { DiffOp } from '@/lib/track-changes';
import {
  DELETE_REASONS,
  NATURE_LABELS,
  codesByDomain,
  defaultNature,
  getCode,
  isConfirmed,
  isUnconfirmedAi,
  itemText,
  rulesFor,
  tagLabel,
} from '@/lib/error-taxonomy';
import type { DeleteReason, Nature } from '@/lib/error-taxonomy';
import type { LabelFields } from '@/lib/tag-edits';

/** The fields a label chip needs (an ErrorTag, or an unsaved one). */
export interface TagChip {
  id?: string;
  error_type: string;
  pattern_name: string;
  code?: string | null;
  rule?: string | null;
  item_target?: string | null;
  item_learner?: string | null;
  custom_label?: string | null;
  nature?: string | null;
  status?: string | null;
  source?: string | null;
}

/** A teacher's own wording used before in this class, for a code. */
export interface LabelSuggestion {
  code: string;
  custom_label: string;
}

/** One change inside a correction (student's words → replacement). */
export interface ChangePair {
  learner: string;
  target: string;
}

/** The separate changes shown in a correction's diff. */
export function changesFromOps(ops: DiffOp[] | null): ChangePair[] {
  if (!ops) return [];
  const out: ChangePair[] = [];
  let cur: ChangePair | null = null;
  for (const op of ops) {
    if (op.type === 'equal') {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    cur = cur ?? { learner: '', target: '' };
    if (op.type === 'delete') cur.learner += op.text;
    else cur.target += op.text;
  }
  if (cur) out.push(cur);
  return out.map((c) => ({ learner: c.learner.trim(), target: c.target.trim() })).filter((c) => c.learner || c.target);
}

export const DOMAIN_STYLE: Record<string, { label: string; cls: string }> = {
  characters: { label: 'Characters', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
  vocabulary: { label: 'Vocabulary', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  grammar: { label: 'Grammar', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  punctuation: { label: 'Punctuation', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
  discourse: { label: 'Linking', cls: 'bg-teal-50 text-teal-800 ring-teal-200' },
  register: { label: 'Register', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  expression: { label: 'Natural expression', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
};

export function domainStyle(errorType: string) {
  return DOMAIN_STYLE[errorType] ?? { label: errorType, cls: 'bg-gray-50 text-gray-700 ring-gray-200' };
}

/**
 * One error label. AI labels the teacher hasn't checked have a dashed outline
 * and an "AI" mark; the teacher can open (change), check (✓) or remove (×) it.
 */
export function LabelChip({
  tag,
  count,
  onEdit,
  onConfirm,
  onRemove,
}: {
  tag: TagChip;
  /** Shows "Grammar 3" instead of the label's name. */
  count?: number;
  onEdit?: () => void;
  onConfirm?: () => void;
  onRemove?: () => void;
}) {
  const style = domainStyle(tag.error_type);
  const unchecked = count === undefined && isUnconfirmedAi(tag);
  const text = count !== undefined ? `${style.label} ${count}` : tagLabel(tag);
  const notes: string[] = [];
  if (unchecked) notes.push('AI suggestion — not yet checked by the teacher');
  else if (count === undefined && isConfirmed(tag)) notes.push(tag.status === 'added' ? 'Added by the teacher' : 'Checked by the teacher');
  if (count === undefined && tag.nature && tag.nature !== 'error') notes.push(NATURE_LABELS[tag.nature as Nature] ?? '');
  const title = notes.filter(Boolean).join(' · ');
  return (
    <span
      title={title || undefined}
      className={`inline-flex max-w-full items-center gap-1 rounded-2xl px-2 py-0.5 text-[11px] font-medium ${style.cls} ${
        unchecked ? 'border border-dashed border-current/40' : 'ring-1 ring-inset'
      }`}
    >
      {unchecked && (
        <span className="rounded bg-white/70 px-1 text-[9px] font-semibold uppercase tracking-wide opacity-70">AI</span>
      )}
      {onEdit ? (
        <button type="button" onClick={onEdit} title="Change this label" className="min-w-0 break-words text-left hover:underline">
          {text}
        </button>
      ) : (
        <span className="min-w-0 break-words">{text}</span>
      )}
      {count === undefined && tag.nature && tag.nature !== 'error' && (
        <span className="rounded bg-white/70 px-1 text-[9px] font-normal opacity-80">
          {tag.nature === 'variant' ? 'variant' : 'style'}
        </span>
      )}
      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          aria-label={`Keep label ${text}`}
          title="Looks right — keep this label"
          className="px-0.5 text-xs leading-none opacity-60 hover:text-green-700 hover:opacity-100"
        >
          &#10003;
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove label ${text}`}
          title="Remove this label"
          className="-mr-1 px-0.5 text-sm leading-none opacity-60 hover:text-red-600 hover:opacity-100"
        >
          &times;
        </button>
      )}
    </span>
  );
}

/** Asks why a label is being removed — answering is optional. */
export function RemoveReasonPrompt({
  name,
  onChoose,
  onCancel,
}: {
  name: string;
  onChoose: (reason: DeleteReason | null) => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="Remove label" className="space-y-1.5 rounded-md border border-red-200 bg-red-50/60 p-2 text-xs">
      <p className="text-gray-700">
        Remove <b className="font-medium">{name}</b>? Why (optional):
      </p>
      <div className="flex flex-wrap gap-1.5">
        {DELETE_REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChoose(r.value)}
            className="rounded-full bg-white px-2 py-0.5 text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChoose(null)}
          className="rounded-full bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700"
        >
          Just remove
        </button>
        <button type="button" onClick={onCancel} className="px-1 text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'min-w-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Choose a label from the list: category (code), optional misuse rule, the
 * exact words, error or just unnatural, and optionally the teacher's own name.
 */
export function LabelEditor({
  id,
  initial,
  changes,
  suggestions,
  onSave,
  onCancel,
}: {
  id: string;
  initial?: Partial<LabelFields>;
  /** The changes in this correction, to fill in the words with one click. */
  changes: ChangePair[];
  suggestions: LabelSuggestion[];
  onSave: (label: LabelFields) => void;
  onCancel: () => void;
}) {
  const only = changes.length === 1 ? changes[0] : null;
  const [code, setCode] = useState(initial?.code ?? '');
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [target, setTarget] = useState(initial ? initial.item_target ?? '' : only?.target ?? '');
  const [learner, setLearner] = useState(initial ? initial.item_learner ?? '' : only?.learner ?? '');
  const [nature, setNature] = useState<Nature>(initial?.nature ?? defaultNature(initial?.code));
  const [custom, setCustom] = useState(initial?.custom_label ?? '');

  const info = getCode(code);
  const rules = rulesFor(code);
  const kind = info?.item ?? 'none';
  const fields: LabelFields | null = info
    ? {
        code,
        rule: rules.some((r) => r.id === rule) ? rule : null,
        item_target: kind === 'none' ? null : target.trim() || null,
        item_learner: kind === 'pair' ? learner.trim() || null : null,
        nature,
        custom_label: custom.trim() || null,
      }
    : null;
  const customNames = Array.from(new Set(suggestions.filter((s) => s.code === code).map((s) => s.custom_label)));

  const chooseCode = (next: string) => {
    // Follow the new category's usual nature unless the teacher picked one
    if (nature === defaultNature(code)) setNature(defaultNature(next));
    if (!rulesFor(next).some((r) => r.id === rule)) setRule('');
    setCode(next);
  };
  const save = () => fields && onSave(fields);

  return (
    <div
      className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <select
        id={`${id}-code`}
        aria-label="Label"
        autoFocus
        value={code}
        onChange={(e) => chooseCode(e.target.value)}
        className={`${inputCls} w-full`}
      >
        <option value="">Choose a label…</option>
        {codesByDomain().map(({ domain, codes }) => (
          <optgroup key={domain.id} label={`${domain.en} · ${domain.zh}`}>
            {codes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.en.includes(c.zh) ? c.en : `${c.en} · ${c.zh}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {info && <p className="text-[11px] leading-snug text-gray-500">{info.definition}</p>}

      {rules.length > 0 && (
        <select
          id={`${id}-rule`}
          aria-label="Rule"
          value={rules.some((r) => r.id === rule) ? rule : ''}
          onChange={(e) => setRule(e.target.value)}
          className={`${inputCls} w-full`}
        >
          <option value="">No specific rule</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.en} · {r.zh}
            </option>
          ))}
        </select>
      )}

      {info && kind !== 'none' && (
        <div className="space-y-1">
          {changes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
              <span>Fill in from the correction:</span>
              {changes.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setTarget(c.target);
                    setLearner(c.learner);
                  }}
                  className="rounded bg-white px-1.5 py-0.5 text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                >
                  {itemText({ item_target: c.target, item_learner: c.learner })}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              id={`${id}-target`}
              aria-label={kind === 'pair' ? 'Correct word' : 'Word'}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={kind === 'pair' ? 'Correct (e.g. 再)' : 'Word (e.g. 见面)'}
              className={`${inputCls} flex-1`}
            />
            {kind === 'pair' && (
              <input
                id={`${id}-learner`}
                aria-label="Student wrote"
                value={learner}
                onChange={(e) => setLearner(e.target.value)}
                placeholder="Student wrote (e.g. 在)"
                className={`${inputCls} flex-1`}
              />
            )}
          </div>
        </div>
      )}

      {info && (
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1 text-[11px]">
          {(Object.keys(NATURE_LABELS) as Nature[]).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nature === n}
              onClick={() => setNature(n)}
              className={`rounded-full px-2 py-0.5 ring-1 ring-inset ${
                nature === n ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-600 ring-gray-300 hover:bg-gray-50'
              }`}
            >
              {NATURE_LABELS[n]}
            </button>
          ))}
        </div>
      )}

      {info && (
        <div>
          <input
            id={`${id}-custom`}
            aria-label="Your own name for this label (optional)"
            list={`${id}-custom-names`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            placeholder="Your own name for it (optional)"
            className={`${inputCls} w-full`}
          />
          <datalist id={`${id}-custom-names`}>
            {customNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )}

      {fields && (
        <p className="text-[11px] text-gray-500">
          Students see: <span className="font-medium text-gray-800">{tagLabel(fields)}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!fields}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {initial?.code ? 'Change' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-1 text-xs text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
  );
}
