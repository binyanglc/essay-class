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
  const [subCounts, setSubCounts] = useState<Record<string, number>>({});
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

      const counts: Record<string, number> = {};
      for (const c of cls) {
        const { count } = await supabase
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .eq('student_id', user.id)
          .eq('class_id', c.id);
        counts[c.id] = count || 0;
      }
      setSubCounts(counts);
    }

    const { data: subs } = await supabase
      .from('submissions')
      .select('*')
      .eq('student_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);
    setRecentSubs(subs || []);

    const errors = await getStudentErrorHistory(supabase, user.id);
    setTopErrors(errors.slice(0, 5));
  }

  const hasClasses = classes.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {profile?.name && profile.name !== 'Guest'
          ? `Hi, ${profile.name}`
          : 'Dashboard'}
      </h1>

      {/* No class — prompt to join */}
      {!hasClasses && (
        <section className="bg-white rounded-xl border-2 border-blue-200 p-6 text-center">
          <h2 className="font-semibold text-lg mb-2">Welcome!</h2>
          <p className="text-sm text-gray-500">
            Use the <span className="font-medium text-gray-700">Join Class</span> button
            in the navigation bar to enter your teacher&apos;s invite code and get started.
          </p>
        </section>
      )}

      {/* My Classes — clickable cards */}
      {hasClasses && (
        <section>
          <h2 className="font-semibold mb-3">My Classes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {classes.map((c) => (
              <Link
                key={c.id}
                href={`/student/class/${c.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <h3 className="font-semibold text-base">{c.class_name}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {subCounts[c.id] || 0} submissions
                </p>
                <span className="text-xs text-blue-600 mt-2 block">
                  View projects & submissions &rarr;
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      {recentSubs.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Recent Activity</h2>
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
        </section>
      )}

      {/* Error summary */}
      {topErrors.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex justify-between items-center mb-3">
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
