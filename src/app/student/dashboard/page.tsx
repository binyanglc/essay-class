'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Profile, Class, Submission, ErrorFrequency, ERROR_TYPE_LABELS } from '@/types';
import { getStudentErrorHistory } from '@/lib/error-tracking';

export default function StudentDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [recentSubs, setRecentSubs] = useState<Submission[]>([]);
  const [topErrors, setTopErrors] = useState<ErrorFrequency[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinSuccess, setJoinSuccess] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    setProfile(prof);

    const { data: memberships } = await supabase
      .from('class_members')
      .select('class_id, classes(*)')
      .eq('student_id', user.id);

    if (memberships) {
      const cls = memberships
        .map((m) => m.classes as unknown as Class)
        .filter(Boolean);
      setClasses(cls);
    }

    const { data: subs } = await supabase
      .from('submissions')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecentSubs(subs || []);

    const errors = await getStudentErrorHistory(supabase, user.id);
    setTopErrors(errors.slice(0, 5));
  }

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    setJoinError('');
    setJoinSuccess('');

    const res = await fetch('/api/classes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: joinCode }),
    });

    const data = await res.json();
    if (data.success || data.class) {
      setJoinSuccess(`Joined: ${data.class.class_name}`);
      setJoinCode('');
      setShowJoinInput(false);
      loadData();
    } else {
      setJoinError(data.error || 'Failed to join');
    }
  };

  const hasClasses = classes.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-2xl font-bold">
          {profile?.name && profile.name !== 'Guest'
            ? `Hi, ${profile.name}`
            : 'Dashboard'}
        </h1>
        {hasClasses && (
          <Link
            href="/student/submit"
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            New Submission
          </Link>
        )}
      </div>

      {/* No class yet — prominent join section */}
      {!hasClasses && (
        <section className="bg-white rounded-xl border-2 border-blue-200 p-6 text-center">
          <h2 className="font-semibold text-lg mb-2">Welcome! Join your class to get started.</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter the invite code your teacher gave you.
          </p>
          <div className="flex gap-2 justify-center">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="INVITE CODE"
              maxLength={6}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm w-40 uppercase tracking-widest text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <button
              onClick={handleJoinClass}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-blue-700 font-medium"
            >
              Join
            </button>
          </div>
          {joinError && (
            <p className="text-sm text-red-600 mt-3">{joinError}</p>
          )}
          {joinSuccess && (
            <p className="text-sm text-green-600 mt-3">{joinSuccess}</p>
          )}
        </section>
      )}

      {/* Has classes — compact class display */}
      {hasClasses && (
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-500">Class:</span>
              {classes.map((c) => (
                <span
                  key={c.id}
                  className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium"
                >
                  {c.class_name}
                </span>
              ))}
            </div>
            <button
              onClick={() => setShowJoinInput(!showJoinInput)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              + Join another
            </button>
          </div>

          {showJoinInput && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Code"
                maxLength={6}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-32 uppercase tracking-widest focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <button
                onClick={handleJoinClass}
                className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-gray-800"
              >
                Join
              </button>
            </div>
          )}
          {joinError && (
            <p className="text-sm text-red-600 mt-2">{joinError}</p>
          )}
          {joinSuccess && (
            <p className="text-sm text-green-600 mt-2">{joinSuccess}</p>
          )}
        </section>
      )}

      {/* Recent submissions */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Recent Submissions</h2>
          {recentSubs.length > 0 && (
            <Link
              href="/student/submissions"
              className="text-sm text-blue-600 hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {recentSubs.length === 0 ? (
          <p className="text-gray-500 text-sm">
            {hasClasses
              ? 'No submissions yet. Tap "New Submission" to get started!'
              : 'Join a class first, then submit your composition.'}
          </p>
        ) : (
          <div className="space-y-2">
            {recentSubs.map((sub) => (
              <Link
                key={sub.id}
                href={`/student/submissions/${sub.id}`}
                className="block p-3 rounded-lg hover:bg-gray-50 border border-gray-100"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">
                    {sub.title || sub.assignment_name || 'Untitled'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(sub.created_at).toLocaleDateString('en-US')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                  {sub.final_text.substring(0, 60)}...
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Top errors */}
      {topErrors.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold">My Common Errors</h2>
            <Link
              href="/student/errors"
              className="text-sm text-blue-600 hover:underline"
            >
              View details
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {topErrors.map((e) => (
              <span
                key={e.error_type}
                className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-full text-sm"
              >
                {ERROR_TYPE_LABELS[e.error_type] || e.error_type} ({e.count})
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
