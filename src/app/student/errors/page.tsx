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

  if (loading) return <p className="text-gray-500">加载中...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">我的常见错误</h1>

      {errors.length === 0 ? (
        <p className="text-gray-500 text-center py-12">
          提交更多作文后，这里会显示你的常见错误类型统计
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <ErrorSummary errors={errors} title="所有提交中的错误分布" />
        </div>
      )}
    </div>
  );
}
