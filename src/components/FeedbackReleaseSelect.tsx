'use client';

import { FEEDBACK_RELEASES } from '@/types';
import type { FeedbackRelease } from '@/types';

/** Teacher setting: whether students see the AI feedback right away or after the teacher releases it. */
export default function FeedbackReleaseSelect({
  id,
  value,
  onChange,
  existingProject = false,
}: {
  id: string;
  value: FeedbackRelease;
  onChange: (value: FeedbackRelease) => void;
  /** Editing a project that may already have submissions. */
  existingProject?: boolean;
}) {
  const current = FEEDBACK_RELEASES.find((r) => r.value === value) ?? FEEDBACK_RELEASES[0];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        Students see the feedback
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as FeedbackRelease)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {FEEDBACK_RELEASES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
            {r.value === 'immediate' ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {current.hint}
        {existingProject && ' Applies to new submissions; feedback already waiting stays hidden until you release it.'}
      </p>
    </div>
  );
}
