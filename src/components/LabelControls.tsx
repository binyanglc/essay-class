'use client';

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
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
import { hitKey, hitSubtitle, hitTitle, searchLabels, suggestForChanges } from '@/lib/label-search';
import type { LabelHit } from '@/lib/label-search';
import { dismissTip, useTipDismissed } from '@/lib/tips';
import {
  getGrammarPoint,
  grammarPointName,
  grammarPointPath,
  grammarPointTitle,
  levelLabel,
  rankGrammarPoints,
  grammarPointsFor,
} from '@/lib/hsk-grammar';
import type { GrammarPoint } from '@/lib/hsk-grammar';

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
  grammar_point?: string | null;
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
  else if (count === undefined && isConfirmed(tag)) {
    notes.push(tag.status === 'added' ? 'Added by the teacher' : tag.status === 'accepted' ? 'Kept by the teacher' : 'Checked by the teacher');
  }
  if (count === undefined && tag.nature && tag.nature !== 'error') notes.push(NATURE_LABELS[tag.nature as Nature] ?? '');
  const gp = count === undefined ? getGrammarPoint(tag.grammar_point) : undefined;
  if (gp) notes.push(grammarPointTitle(gp));
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
      {gp && (
        <span className="shrink-0 rounded bg-white/70 px-1 text-[9px] font-semibold tracking-wide opacity-80">
          {levelLabel(gp)}
        </span>
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
  const [grammarPoint, setGrammarPoint] = useState<string | null>(initial?.grammar_point ?? null);

  const info = getCode(code);
  // A grammar point stays only while it is listed under the chosen code
  const gp = getGrammarPoint(grammarPoint);
  const gpValid = gp && gp.families.includes(code) ? gp : undefined;
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
        grammar_point: gpValid?.id ?? null,
      }
    : null;
  const customNames = Array.from(new Set(suggestions.filter((s) => s.code === code).map((s) => s.custom_label)));

  const chooseCode = (next: string) => {
    // Follow the new category's usual nature unless the teacher picked one
    if (nature === defaultNature(code)) setNature(defaultNature(next));
    if (!rulesFor(next).some((r) => r.id === rule)) setRule('');
    setCode(next);
  };
  /** A category, a misuse rule (category + rule) or the class's own name (category + name). */
  const pick = (hit: LabelHit) => {
    chooseCode(hit.code.code);
    if (hit.rule) setRule(hit.rule.id);
    if (hit.custom) setCustom(hit.custom);
    if (hit.gp) setGrammarPoint(hit.gp.id);
  };
  const save = () => fields && onSave(fields);

  return (
    <div
      className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <LabelPicker id={id} code={code} changes={changes} suggestions={suggestions} onPick={pick} />
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

      {info && grammarPointsFor(code).length > 0 && (
        <GrammarPointPicker
          id={`${id}-gp`}
          code={code}
          value={gpValid ?? null}
          changes={changes}
          onChange={(g) => setGrammarPoint(g?.id ?? null)}
        />
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
          {gpValid && <span className="ml-1 text-gray-500">({levelLabel(gpValid)})</span>}
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

export const LABELS_TIP = 'labels-intro';

/** First-time note for teachers: labels are what the tracking is built from. */
export function LabelsTip() {
  const dismissed = useTipDismissed(LABELS_TIP);
  if (dismissed) return null;
  return (
    <div role="note" className="rounded-md bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900 ring-1 ring-inset ring-blue-200">
      <p>
        <b className="font-semibold">Labels build the tracking.</b>{' '}
        Each student&apos;s long-term error patterns and your class&apos;s Common Issues come only from labels — a
        correction without a label isn&apos;t counted there.
      </p>
      <button
        type="button"
        onClick={() => dismissTip(LABELS_TIP)}
        className="mt-1 font-medium text-blue-700 hover:underline"
      >
        Got it
      </button>
    </div>
  );
}

/**
 * Choose the label: type to search (Chinese or English — 了, 补语, 把, word
 * choice…), or browse the list. Before typing, labels that fit the
 * correction's changed words come first.
 */
function LabelPicker({
  id,
  code,
  changes,
  suggestions,
  onPick,
}: {
  id: string;
  code: string;
  changes: ChangePair[];
  suggestions: LabelSuggestion[];
  onPick: (hit: LabelHit) => void;
}) {
  const info = getCode(code);
  const [open, setOpen] = useState(!info);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const results = query.trim() ? searchLabels(query, suggestions).slice(0, 30) : [];
  const fits = query.trim() ? [] : suggestForChanges(changes);
  const browse = query.trim()
    ? []
    : codesByDomain().map(({ domain, codes }) => ({
        heading: `${domain.en} · ${domain.zh}`,
        hits: codes.map((c): LabelHit => ({ code: c, rule: null, custom: null })),
      }));
  // Everything in the list, in order, for the arrow keys
  const items: LabelHit[] = query.trim() ? results : [...fits, ...browse.flatMap((g) => g.hits)];
  const current = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (i: number) => `${id}-option-${i}`;

  const choose = (hit: LabelHit) => {
    onPick(hit);
    setOpen(false);
    setQuery('');
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, Math.min(items.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      document.getElementById(optionId(next))?.scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[current]) choose(items[current]);
    } else if (e.key === 'Escape' && (query || info)) {
      // First Escape clears the search (or keeps the label already chosen); the next one closes the editor
      e.stopPropagation();
      if (query) {
        setQuery('');
        setActive(0);
      } else setOpen(false);
    }
  };

  if (!open && info) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs font-medium text-gray-900">{info.en.includes(info.zh) ? info.en : `${info.en} · ${info.zh}`}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-[11px] font-medium text-blue-600 hover:underline"
        >
          Choose another
        </button>
      </div>
    );
  }

  // Where each browse group starts in `items`
  const groupStarts = browse.map((_, gi) => fits.length + browse.slice(0, gi).reduce((n, g) => n + g.hits.length, 0));
  const option = (hit: LabelHit, i: number, keyPrefix: string) => {
    const sub = hitSubtitle(hit);
    return (
      <div
        key={`${keyPrefix}-${hitKey(hit)}`}
        id={optionId(i)}
        role="option"
        aria-selected={i === current}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setActive(i)}
        onClick={() => choose(hit)}
        className={`cursor-pointer px-2 py-1 text-xs ${i === current ? 'bg-blue-50 text-blue-900' : 'text-gray-800'} ${
          hit.code.code === code && !hit.rule && !hit.custom && !hit.gp ? 'font-semibold' : ''
        }`}
      >
        <span>{hitTitle(hit)}</span>
        {sub && (
          <span className="ml-1 text-[11px] text-gray-500">
            {hit.custom ? 'your label · ' : ''}
            {sub}
          </span>
        )}
      </div>
    );
  };
  const heading = (text: string) => (
    <div role="presentation" className="sticky top-0 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
      {text}
    </div>
  );

  return (
    <div>
      <input
        id={`${id}-search`}
        role="combobox"
        aria-label="Search labels"
        aria-expanded="true"
        aria-controls={`${id}-options`}
        aria-activedescendant={items.length ? optionId(current) : undefined}
        aria-autocomplete="list"
        autoFocus
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search: 了, 补语, 把, 量词, word choice…"
        className={`${inputCls} w-full`}
      />
      <div
        id={`${id}-options`}
        role="listbox"
        aria-label="Labels"
        className="mt-1 max-h-56 overflow-y-auto rounded border border-gray-200 bg-white py-0.5"
      >
        {query.trim() ? (
          results.length ? (
            results.map((h, i) => option(h, i, 'r'))
          ) : (
            <p className="px-2 py-1.5 text-[11px] leading-snug text-gray-500">
              No label matches “{query.trim()}”. Try another word (Chinese or English), or choose Other grammar and add
              your own name.
            </p>
          )
        ) : (
          <>
            {fits.length > 0 && (
              <>
                {heading('Fits this correction')}
                {fits.map((h, i) => option(h, i, 'fit'))}
              </>
            )}
            {browse.map((g, gi) => (
              <div key={g.heading} role="group" aria-label={g.heading}>
                {heading(g.heading)}
                {g.hits.map((h, i) => option(h, groupStarts[gi] + i, 'all'))}
              </div>
            ))}
          </>
        )}
      </div>
      {info && (
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery('');
          }}
          className="mt-1 text-[11px] text-gray-500 hover:text-gray-800"
        >
          Keep {info.en}
        </button>
      )}
    </div>
  );
}

/**
 * Optional: which point of the 2025 HSK syllabus the label is about. Points
 * whose words the correction added, removed or changed are offered first;
 * the rest can be searched.
 */
function GrammarPointPicker({
  id,
  code,
  value,
  changes,
  onChange,
}: {
  id: string;
  code: string;
  value: GrammarPoint | null;
  changes: ChangePair[];
  onChange: (g: GrammarPoint | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const changed = changes.flatMap((c) => [c.learner, c.target]).filter(Boolean);
  const { fits, rest } = rankGrammarPoints(code, changed);
  const q = query.trim().toLowerCase();
  const matches = (g: GrammarPoint) =>
    `${g.text} ${g.item} ${grammarPointPath(g)} ${levelLabel(g)}`.toLowerCase().includes(q);
  const shownFits = q ? fits.filter(matches) : fits;
  const shownRest = q ? rest.filter(matches) : rest;
  const first = shownFits[0] ?? shownRest[0];
  const label = 'text-[11px] font-medium text-gray-600';
  const optionText = (g: GrammarPoint) => `${levelLabel(g)} · ${grammarPointName(g)}`;
  const chipCls = 'rounded bg-white px-1.5 py-0.5 text-gray-700 ring-1 ring-inset ring-gray-200 hover:bg-gray-50';

  if (value) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[11px]">
          <span className={label}>HSK grammar point: </span>
          <span className="font-medium text-gray-900" title={grammarPointTitle(value)}>
            {optionText(value)}
          </span>
          <span className="block text-gray-500">{grammarPointPath(value)}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Remove grammar point"
          title="Remove grammar point"
          className="shrink-0 px-1 text-sm leading-none text-gray-500 hover:text-red-600"
        >
          &times;
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className={label}>HSK grammar point (optional):</span>
        {fits.slice(0, 2).map((g) => (
          <button key={g.id} type="button" title={grammarPointTitle(g)} onClick={() => onChange(g)} className={chipCls}>
            {optionText(g)}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-blue-600 hover:underline">
          {fits.length ? 'More…' : 'Choose…'}
        </button>
      </div>
    );
  }
  const option = (g: GrammarPoint) => (
    <div
      key={g.id}
      role="option"
      aria-selected={g === first}
      title={grammarPointTitle(g)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onChange(g)}
      className={`cursor-pointer px-2 py-1 text-xs text-gray-800 hover:bg-blue-50 ${g === first ? 'bg-blue-50/60' : ''}`}
    >
      <span>{optionText(g)}</span>
      <span className="ml-1 text-[11px] text-gray-500">{grammarPointPath(g)}</span>
    </div>
  );
  const heading = (text: string) => (
    <div role="presentation" className="sticky top-0 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
      {text}
    </div>
  );
  return (
    <div>
      <input
        id={`${id}-search`}
        aria-label="Search grammar points"
        autoFocus
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (first) onChange(first);
          } else if (e.key === 'Escape') {
            // First Escape clears the search, the next closes the list (not the label editor)
            e.stopPropagation();
            if (query) setQuery('');
            else setOpen(false);
          }
        }}
        placeholder="Search HSK 2025 grammar points…"
        className={`${inputCls} w-full`}
      />
      <div
        role="listbox"
        aria-label="Grammar points"
        className="mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white py-0.5"
      >
        {!first && <p className="px-2 py-1.5 text-[11px] text-gray-500">No grammar point matches.</p>}
        {shownFits.length > 0 && (
          <>
            {heading('Fits this correction')}
            {shownFits.map(option)}
          </>
        )}
        {shownRest.length > 0 && (
          <>
            {shownFits.length > 0 && heading('All')}
            {shownRest.map(option)}
          </>
        )}
      </div>
      <button type="button" onClick={() => setOpen(false)} className="mt-1 text-[11px] text-gray-500 hover:text-gray-800">
        Skip
      </button>
    </div>
  );
}
