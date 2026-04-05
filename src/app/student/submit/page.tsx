'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import SubmissionForm from '@/components/SubmissionForm';
import { Class } from '@/types';

export default function SubmitPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadClasses() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberships } = await supabase
        .from('class_members')
        .select('class_id, classes(*)')
        .eq('student_id', user.id);

      if (memberships) {
        const cls = memberships
          .map((m) => m.classes as unknown as Class)
          .filter(Boolean);
        setClasses(cls);
        if (cls.length === 1) {
          setSelectedClass(cls[0].id);
        }
      }
      setLoading(false);
    }
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold mb-2">No Class Joined</h2>
        <p className="text-gray-500 mb-4">
          Please join a class first using the invite code on your dashboard.
        </p>
        <a
          href="/student/dashboard"
          className="text-blue-600 hover:underline text-sm"
        >
          Go to Dashboard
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">New Submission</h1>

      {classes.length > 1 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Class
          </label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Choose a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.class_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedClass ? (
        <SubmissionForm classId={selectedClass} />
      ) : (
        <p className="text-gray-500 text-sm">Please select a class first</p>
      )}
    </div>
  );
}
