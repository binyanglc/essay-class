'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { HintKind } from '@/types';
import { diffChars } from '@/lib/track-changes';
import type { DraftStatus } from '@/lib/drafts';
import type { PatternFamily, PatternSentence, QuizItem } from '@/lib/error-patterns';
import { DiffOps } from './TrackChangesView';
import HintText from './HintText';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The same marks as on a "hints only" composition, so students recognise them. */
const MARK_STYLE: Record<HintKind, string> = {
  wrong: 'bg-amber-100 underline decoration-amber-500 decoration-wavy decoration-1 underline-offset-4',
  extra: 'bg-rose-100 underline decoration-rose-400 decoration-dotted decoration-2 underline-offset-4',
  order: 'bg-violet-100 underline decoration-violet-400 decoration-1 underline-offset-4',
  missing: '',
};
/** Other problems in the same sentence, of another kind: there, but quiet. */
const OTHER_MARK = 'underline decoration-gray-300 decoration-dotted decoration-1 underline-offset-4';

function AiBadge() {
  return (
    <span
      title="AI suggestion — your teacher hasn't checked it yet"
      className="rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-500 ring-1 ring-inset ring-gray-200"
    >
      AI
    </span>
  );
}

const STATUS: Record<DraftStatus, { text: (n: number) => string; cls: string }> = {
  fixed: { text: (n) => `✓ Fixed in draft ${n}`, cls: 'bg-green-50 text-green-800 ring-green-200' },
  still: { text: (n) => `Still needs work in draft ${n}`, cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  unchanged: { text: (n) => `Not changed in draft ${n}`, cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

function StatusChip({ status, draft }: { status: DraftStatus; draft: number }) {
  const s = STATUS[status];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}>{s.text(draft)}</span>
  );
}

/** A "hints only" sentence: the problems of this kind marked, the others faint — never the answer. */
function MarkedSentence({ s }: { s: PatternSentence }) {
  const focus = new Set(s.focus);
  const order = s.marks.map((m, i) => ({ m, i })).sort((a, b) => a.m.start - b.m.start);
  const out: ReactNode[] = [];
  let at = 0;
  for (const { m, i } of order) {
    if (m.start < at || m.end > s.original.length) continue;
    if (m.start > at) out.push(<span key={`p${i}`}>{s.original.slice(at, m.start)}</span>);
    const text = s.original.slice(m.start, m.end);
    if (m.kind === 'missing' || !text) {
      out.push(
        <span
          key={`m${i}`}
          aria-label="something is missing here"
          className={`mx-[1px] align-[-0.3em] text-[0.8em] font-bold ${focus.has(i) ? 'text-rose-600' : 'text-gray-300'}`}
        >
          ∧
        </span>
      );
    } else {
      out.push(
        <span key={`m${i}`} className={`rounded-sm ${focus.has(i) ? MARK_STYLE[m.kind] : OTHER_MARK}`}>
          {text}
        </span>
      );
    }
    at = m.end;
  }
  if (at < s.original.length) out.push(<span key="rest">{s.original.slice(at)}</span>);
  return <p className="text-[16px] leading-8 text-gray-900">{out}</p>;
}

function SentenceText({ s }: { s: PatternSentence }) {
  if (s.kind === 'corrections' && s.revised) {
    return (
      <p className="text-[16px] leading-8 text-gray-900">
        <DiffOps ops={diffChars(s.original, s.revised)} />
      </p>
    );
  }
  if (s.marks.length) return <MarkedSentence s={s} />;
  return <p className="text-[16px] leading-8 text-gray-900">{s.original}</p>;
}

function SentenceCard({ s }: { s: PatternSentence }) {
  const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
      {/* A grid, so the long title can't make the page wider than a phone */}
      <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs text-gray-400">
        <span className="truncate" title={s.title}>
          {s.title || 'Composition'}
          {date && ` · ${date}`}
        </span>
        <span className="flex items-center gap-2">
          {s.unchecked && <AiBadge />}
          {s.status && s.nextDraft && <StatusChip status={s.status} draft={s.nextDraft} />}
        </span>
      </div>
      <SentenceText s={s} />
      {s.count > 1 && <p className="mt-0.5 text-xs text-gray-500">{s.count} problems of this kind in this sentence</p>}

      {s.why.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.kind === 'hints' ? 'Hint' : 'Why'}</p>
          {s.why.length === 1 ? (
            <p className="mt-0.5 text-sm text-gray-700">{s.why[0]}</p>
          ) : (
            <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
              {s.why.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {s.usage && (
        <div className="mt-3 rounded-md bg-gray-50 p-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Usage &amp; examples</p>
          <HintText hint={s.usage} className="text-sm text-gray-700" />
        </div>
      )}

      <div className="mt-2 text-right">
        <Link href={`/student/submissions/${s.submissionId}`} className="text-xs text-blue-600 hover:underline">
          Open composition →
        </Link>
      </div>
    </div>
  );
}

/** One fill-in-the-blank question: the right word or the one it gets mixed up with. */
function QuizQuestion({ q, n }: { q: QuizItem; n: number }) {
  const [picked, setPicked] = useState<'answer' | 'other' | null>(null);
  const options: { which: 'answer' | 'other'; zh: string }[] = [
    { which: 'answer', zh: q.answer.zh },
    { which: 'other', zh: q.other.zh },
  ];
  if (q.otherFirst) options.reverse();
  const done = picked !== null;
  return (
    <li className="rounded-lg bg-white p-3 ring-1 ring-inset ring-gray-200">
      <p className="text-[16px] leading-8 text-gray-900">
        <span className="mr-2 text-xs text-gray-400">{n}.</span>
        {q.before}
        <span
          className={`mx-0.5 inline-block min-w-[3em] border-b-2 px-1 text-center ${
            picked === 'answer' ? 'border-green-500 text-green-800' : picked === 'other' ? 'border-rose-400 text-rose-700' : 'border-gray-400'
          }`}
        >
          {picked === 'answer' ? q.answer.zh : picked === 'other' ? q.other.zh : ' '}
        </span>
        {q.after}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const right = o.which === 'answer';
          const cls = !done
            ? 'bg-white text-gray-900 ring-gray-300 hover:bg-gray-50'
            : right
            ? 'bg-green-50 text-green-800 ring-green-300'
            : picked === o.which
            ? 'bg-rose-50 text-rose-700 ring-rose-300'
            : 'bg-white text-gray-400 ring-gray-200';
          return (
            <button
              key={o.which}
              type="button"
              onClick={() => setPicked(o.which)}
              disabled={done}
              className={`rounded-md px-3 py-1.5 text-[15px] ring-1 ring-inset transition-colors ${cls}`}
            >
              {o.zh}
            </button>
          );
        })}
        {done && (
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-gray-400 hover:text-gray-600">
            Try again
          </button>
        )}
      </div>
      {done && (
        <div className="mt-2 text-sm">
          <p className={picked === 'answer' ? 'font-medium text-green-700' : 'font-medium text-rose-700'}>
            {picked === 'answer' ? '✓ Right.' : `Not ${q.other.zh} here — it's ${q.answer.zh}.`}
          </p>
          <p className="mt-1 text-gray-700">
            <span lang="zh" className="font-medium text-gray-900">
              {q.answer.zh}
            </span>
            {q.answer.pinyin && <span className="ml-1.5 text-gray-500">{q.answer.pinyin}</span>}
            {q.answer.en && <span className="text-gray-500"> — {q.answer.en}</span>}
          </p>
          <p className="text-gray-700">
            <span lang="zh" className="font-medium text-gray-900">
              {q.other.zh}
            </span>
            {q.other.pinyin && <span className="ml-1.5 text-gray-500">{q.other.pinyin}</span>}
            {q.other.en && <span className="text-gray-500"> — {q.other.en}</span>}
          </p>
          <div className="mt-1.5 border-l-2 border-gray-200 pl-2.5 text-[13px]">
            <p lang="zh" className="text-gray-900">
              {q.example.zh}
            </p>
            {q.example.pinyin && <p className="text-gray-500">{q.example.pinyin}</p>}
            {q.example.en && <p className="italic text-gray-500">{q.example.en}</p>}
          </div>
        </div>
      )}
    </li>
  );
}

export function QuickCheck({ items }: { items: QuizItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 sm:p-4">
      <h4 className="text-sm font-semibold text-blue-900">Quick check</h4>
      <p className="mb-2 text-xs text-blue-800/80">Which word goes in the blank? These are new sentences, not yours.</p>
      <ol className="space-y-2">
        {items.map((q, i) => (
          <QuizQuestion key={q.key} q={q} n={i + 1} />
        ))}
      </ol>
    </section>
  );
}

const SHOWN = 3;

/** One kind of error: a summary line; open, the student's sentences with what to learn from each, then a quick check. */
export function PatternFamilyCard({
  f,
  open,
  onToggle,
}: {
  f: PatternFamily;
  open: boolean;
  onToggle: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? f.sentences : f.sentences.slice(0, SHOWN);
  return (
    <div id={`pattern-${f.key}`} className="scroll-mt-20 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-gray-50"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              f.compositions >= 3
                ? 'bg-red-50 text-red-700'
                : f.compositions === 2
                ? 'bg-orange-50 text-orange-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f.count}×
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-medium text-gray-900">
              {f.name}
              {f.zh && f.zh !== f.name && <span className="ml-1.5 font-normal text-gray-500">{f.zh}</span>}
            </span>
            <span className="text-xs text-gray-400">
              {f.compositions >= 3 ? 'Keeps coming back · ' : ''}
              {plural(f.compositions, 'composition')} · {plural(f.sentences.length, 'sentence')}
            </span>
            {f.chips.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {f.chips.slice(0, 8).map((c) => (
                  <span key={c.text} lang="zh" className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                    {c.text}
                    {c.count > 1 && <span className="ml-1 text-gray-400">×{c.count}</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
        <svg
          className={`mt-1 h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-3 pb-4 pt-3 sm:px-4">
          {f.about && <p className="mb-3 text-xs text-gray-500">{f.about}</p>}
          <div className="space-y-3">
            {shown.map((s) => (
              <SentenceCard key={s.key} s={s} />
            ))}
          </div>
          {f.sentences.length > SHOWN && (
            <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-medium text-blue-600 hover:underline">
              {all ? 'Show fewer' : `Show ${f.sentences.length - SHOWN} more`}
            </button>
          )}
          <QuickCheck items={f.quiz} />
        </div>
      )}
    </div>
  );
}

/** What to work on first: the kinds of error that come back in the most compositions. */
export function FocusList({ families, onPick }: { families: PatternFamily[]; onPick: (key: string) => void }) {
  if (families.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">Start here</h2>
      <ol className="grid gap-2 sm:grid-cols-3">
        {families.map((f, i) => (
          <li key={f.key}>
            <button
              type="button"
              onClick={() => onPick(f.key)}
              className="flex h-full w-full items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40"
            >
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{f.name}</span>
                {f.zh && <span className="block text-xs text-gray-500">{f.zh}</span>}
                <span className="mt-0.5 block text-xs text-gray-400">
                  {f.count}× · {plural(f.compositions, 'composition')}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
