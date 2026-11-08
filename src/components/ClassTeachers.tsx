'use client';

import { useEffect, useState } from 'react';
import type { ClassTeacher } from '@/types';
import type { ClassRole } from '@/lib/class-access';

interface Props {
  classId: string;
  /** After this teacher leaves the class (an added teacher only). */
  onLeft?: () => void;
}

type Loaded = { me: { id: string; role: ClassRole }; ready: boolean; teachers: ClassTeacher[] };

const displayName = (t: ClassTeacher) => t.name?.trim() || t.email || 'Teacher';

/**
 * The teachers of a class (migration v21). The teacher who created it adds
 * colleagues by the email they signed up with, and can remove them; an added
 * teacher can leave. Every teacher here can do everything with the class's
 * work; only the creator can delete the class or change who teaches it.
 */
export default function ClassTeachers({ classId, onLeft }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/classes/${classId}/teachers`).catch(() => null);
    if (!res?.ok) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    setData(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const isOwner = data?.me.role === 'owner';
  const owner = data?.teachers.find((t) => t.is_owner);

  const handleAdd = async () => {
    const value = email.trim();
    if (!value) return;
    setAdding(true);
    setMessage(null);
    const res = await fetch(`/api/classes/${classId}/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setAdding(false);
    if (!res?.ok) {
      setMessage({ kind: 'error', text: body?.error || 'Couldn’t add this teacher. Please try again.' });
      return;
    }
    setEmail('');
    setMessage({ kind: 'ok', text: `${displayName(body as ClassTeacher)} can now see and edit this class.` });
    load();
  };

  const handleRemove = async (t: ClassTeacher) => {
    const leaving = t.id === data?.me.id;
    const question = leaving
      ? 'Leave this class? You will no longer see its students’ work. The teacher who created it can add you again.'
      : `Remove ${displayName(t)} from this class? They will no longer see its students’ work.`;
    if (!confirm(question)) return;
    setRemoving(t.id);
    setMessage(null);
    const res = await fetch(`/api/classes/${classId}/teachers?teacherId=${encodeURIComponent(t.id)}`, {
      method: 'DELETE',
    }).catch(() => null);
    setRemoving(null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setMessage({ kind: 'error', text: body?.error || 'Couldn’t remove this teacher. Please try again.' });
      return;
    }
    if (leaving) {
      onLeft?.();
      return;
    }
    load();
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold mb-1">Teachers{data ? ` (${data.teachers.length})` : ''}</h2>
      <p className="text-xs text-gray-500 mb-3">
        Every teacher here can see and edit all students’ compositions and feedback, release feedback, and
        manage assignments and students. Only {isOwner ? 'you' : owner ? displayName(owner) : 'the teacher who created the class'}{' '}
        can delete the class or change who teaches it.
      </p>

      {loadFailed && <p className="text-sm text-red-600">Couldn’t load the teachers. Reload the page to try again.</p>}

      {data && (
        <div className="space-y-2">
          {data.teachers.map((t) => {
            const isMe = t.id === data.me.id;
            const canRemove = !t.is_owner && (isOwner || isMe);
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">
                      {displayName(t)}
                      {isMe && <span className="font-normal text-gray-400"> (you)</span>}
                    </span>
                    {t.email && t.email !== displayName(t) && (
                      <span className="truncate text-xs text-gray-500">{t.email}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {t.is_owner
                      ? 'Created the class'
                      : t.added_at
                        ? `Added ${new Date(t.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : 'Added'}
                  </span>
                </div>
                {canRemove && (
                  <button
                    onClick={() => handleRemove(t)}
                    disabled={removing === t.id}
                    className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                    title={isMe ? 'Leave this class' : 'Remove from this class'}
                  >
                    {isMe ? 'Leave class' : '✕'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && isOwner && data.ready && (
        <div className="mt-4 max-w-xl">
          <label htmlFor="add-teacher-email" className="block text-sm font-medium mb-1">
            Add a teacher
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="add-teacher-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="The email they signed up with"
              autoComplete="off"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !email.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {adding ? 'Adding...' : 'Add teacher'}
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            They need a teacher account first: ask them to sign up as a teacher with this email.
          </p>
        </div>
      )}

      {data && isOwner && !data.ready && (
        <p className="mt-3 text-xs text-gray-500">Adding teachers will work once the site’s database is updated.</p>
      )}

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-green-700'}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
