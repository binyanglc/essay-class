'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { FeedbackComment, HintKind } from '@/types';
import {
  HINT_KIND_LABELS,
  hintCommentKey,
  hintSegments,
  kindsOf,
  placeHints,
} from '@/lib/hints';
import type { HintItem, HintTag, HintView } from '@/lib/hints';
import { LabelChip } from './LabelControls';
import { NumberBadge } from './TrackChangesView';
import { CommentThread } from './FeedbackView';
import CompositionPhoto from './CompositionPhoto';

/** How each kind of mark looks, in the composition and in the legend. */
const MARK_STYLE: Record<HintKind, string> = {
  wrong: 'bg-amber-100 underline decoration-amber-500 decoration-wavy decoration-1 underline-offset-4',
  extra: 'bg-rose-100 underline decoration-rose-400 decoration-dotted decoration-2 underline-offset-4',
  order: 'bg-violet-100 underline decoration-violet-400 decoration-1 underline-offset-4',
  missing: '',
};

function Caret() {
  return (
    <span aria-label="something is missing here" className="mx-[1px] align-[-0.3em] text-[0.8em] font-bold text-rose-600">
      ∧
    </span>
  );
}

function MarkedText({ kind, text }: { kind: HintKind; text: string }) {
  if (kind === 'missing' || !text) return <Caret />;
  return <span className={`rounded-sm ${MARK_STYLE[kind]}`}>{text}</span>;
}

function KindTag({ kind }: { kind: HintKind }) {
  const color: Record<HintKind, string> = {
    wrong: 'bg-amber-50 text-amber-800 ring-amber-200',
    missing: 'bg-rose-50 text-rose-700 ring-rose-200',
    extra: 'bg-rose-50 text-rose-700 ring-rose-200',
    order: 'bg-violet-50 text-violet-700 ring-violet-200',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${color[kind]}`}>
      {HINT_KIND_LABELS[kind]}
    </span>
  );
}

/** The hint's sentence with its marks (offsets are within the sentence). */
export function HintSentence({ hint }: { hint: HintItem }) {
  const words = hint.original;
  if (!words) {
    return <p className="text-xs text-gray-400">This sentence couldn&apos;t be found in your composition — ask your teacher.</p>;
  }
  const marks = [...(hint.marks ?? [])].sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  marks.forEach((m, i) => {
    if (m.start < at || m.end > words.length) return;
    if (m.start > at) out.push(<span key={`p${i}`}>{words.slice(at, m.start)}</span>);
    out.push(<MarkedText key={`m${i}`} kind={m.kind} text={words.slice(m.start, m.end)} />);
    at = m.end;
  });
  if (at < words.length) out.push(<span key="rest">{words.slice(at)}</span>);
  return <p className="leading-8 text-gray-900">{out}</p>;
}

/**
 * "Hints only" feedback for the student (or the teacher's preview of it):
 * the composition with the problems marked, and one card per problem with its
 * kind, labels and hint — never the corrected sentence.
 */
export default function HintsView({
  text,
  view,
  preview = false,
  imagePath,
  label = 'Your Composition',
}: {
  text: string;
  view: HintView;
  /** The uploaded photo, if any (shown on request). */
  imagePath?: string | null;
  /** The teacher's look at what the student sees: no discussion box. */
  preview?: boolean;
  label?: string;
}) {
  const { feedback, tags } = view;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [commentsVersion, setCommentsVersion] = useState(0);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    fetch(`/api/feedback/${feedback.id}/comments`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FeedbackComment[]) => {
        if (!cancelled) setComments(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feedback.id, preview, commentsVersion]);

  const { placed, unplaced } = useMemo(() => placeHints(text, feedback.hints), [text, feedback.hints]);
  const ordered = useMemo(() => [...placed.map((p) => p.hint), ...unplaced], [placed, unplaced]);
  const numbers = useMemo(() => new Map(ordered.map((h, i) => [h.id, i + 1] as [string, number])), [ordered]);
  const segments = useMemo(() => hintSegments(text, placed, numbers), [text, placed, numbers]);
  const tagsFor = (id: string): HintTag[] => tags.filter((t) => t.revision_id === id);
  const otherTags = tags.filter((t) => !t.revision_id || !numbers.has(t.revision_id));
  const usedKinds = kindsOf(feedback.hints.flatMap((h) => h.marks ?? []));

  const select = (id: string) => {
    setActiveId(id);
    requestAnimationFrame(() =>
      document.getElementById(`hint-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        <span className="text-xs text-gray-400">{text.length} characters</span>
        {imagePath && (
          <button
            type="button"
            onClick={() => setShowPhoto((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showPhoto ? 'Hide photo' : 'Show photo'}
          </button>
        )}
        {ordered.length > 0 && (
          <span className="ml-auto rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            {ordered.length} {ordered.length === 1 ? 'thing' : 'things'} to fix
          </span>
        )}
      </div>

      {ordered.length > 0 ? (
        <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2.5 text-sm leading-relaxed text-blue-900">
          {preview ? 'This is what the student sees.' : 'Your teacher wants you to fix these yourself.'} The marks show
          where each problem is; the hints below say what kind of problem it is. Then rewrite your composition.
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-800">Nothing to fix — well done!</p>
      )}

      {showPhoto && imagePath && (
        <div className="mb-3">
          <CompositionPhoto key={imagePath} path={imagePath} />
        </div>
      )}

      <div className="rounded-lg bg-gray-50 p-4 text-[17px] leading-9 text-gray-900 whitespace-pre-wrap">
        {segments.map((seg, i) =>
          seg.kind === 'plain' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => select(seg.hintId)}
              className={`rounded-sm ${activeId === seg.hintId ? 'outline outline-2 outline-blue-400' : ''}`}
              title="Show the hint"
            >
              <MarkedText kind={seg.mark} text={seg.text} />
              {seg.last && <NumberBadge n={seg.n} />}
            </button>
          )
        )}
      </div>

      {usedKinds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {usedKinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              {k === 'missing' ? <Caret /> : <span className={`rounded-sm px-1 ${MARK_STYLE[k]}`}>字</span>}
              {HINT_KIND_LABELS[k]}
            </span>
          ))}
        </div>
      )}

      {ordered.length > 0 && (
        <ol className="mt-5 space-y-3">
          {ordered.map((h) => {
            const n = numbers.get(h.id)!;
            const hTags = tagsFor(h.id);
            const key = hintCommentKey(h);
            return (
              <li
                key={h.id}
                id={`hint-${h.id}`}
                className={`rounded-lg border bg-white p-4 text-sm ${
                  activeId === h.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
                }`}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <NumberBadge n={n} raised={false} teacher={h.source === 'teacher'} />
                  {kindsOf(h.marks).map((k) => (
                    <KindTag key={k} kind={k} />
                  ))}
                  {hTags.map((t) => (
                    <LabelChip key={t.id} tag={{ ...t, pattern_name: '' }} />
                  ))}
                </div>
                <div className="mt-2">
                  <HintSentence hint={h} />
                </div>
                {h.hint && (
                  <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 leading-relaxed text-gray-700">
                    <span className="font-medium text-gray-900">Hint: </span>
                    {h.hint}
                  </p>
                )}
                {!preview && (
                  <div className="-ml-3">
                    <CommentThread
                      feedbackId={feedback.id}
                      section={key}
                      comments={comments.filter((c) => c.section === key)}
                      onRefresh={() => setCommentsVersion((v) => v + 1)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {otherTags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span>Also noted:</span>
          {otherTags.map((t) => (
            <LabelChip key={t.id} tag={{ ...t, pattern_name: '' }} />
          ))}
        </div>
      )}

    </div>
  );
}
