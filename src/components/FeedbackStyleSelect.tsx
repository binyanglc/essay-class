'use client';

import { FEEDBACK_STYLES } from '@/types';
import type { FeedbackStyle } from '@/types';

/** Teacher setting: corrections, or hints only (students fix the problems themselves). */
export default function FeedbackStyleSelect({
  id,
  value,
  onChange,
  existingProject = false,
}: {
  id: string;
  value: FeedbackStyle;
  onChange: (value: FeedbackStyle) => void;
  /** Editing a project that may already have submissions. */
  existingProject?: boolean;
}) {
  const current = FEEDBACK_STYLES.find((s) => s.value === value) ?? FEEDBACK_STYLES[0];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-gray-500">
        Feedback style
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as FeedbackStyle)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {FEEDBACK_STYLES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
            {s.value === 'corrections' ? ' (default)' : ''}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {current.hint}
        {existingProject && ' Applies to new submissions; feedback already given stays as it is.'}
      </p>
    </div>
  );
}
