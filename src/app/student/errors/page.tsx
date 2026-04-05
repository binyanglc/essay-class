'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ErrorFrequency } from '@/types';
import { getStudentErrorHistory } from '@/lib/error-tracking';
import ErrorSummary from '@/components/ErrorSummary';

export default function StudentErrorsPage() {
  const [errors, setErrors] = useState<ErrorFrequency[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const history = await getStudentErrorHistory(supabase, user.id);
      setErrors(history);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Error Patterns</h1>

      {errors.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          Submit more compositions and your error pattern statistics will appear here.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <ErrorSummary errors={errors} title="Error Distribution Across All Submissions" />
        </div>
      )}
    </div>
  );
}
