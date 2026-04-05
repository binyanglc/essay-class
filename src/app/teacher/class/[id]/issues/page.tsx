'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class, ErrorType } from '@/types';
import ClassIssues from '@/components/ClassIssues';

interface ClassError {
  error_type: ErrorType;
  count: number;
  examples: { original: string; revision: string; explanation: string }[];
}

export default function ClassIssuesPage() {
  const { id } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [errors, setErrors] = useState<ClassError[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [filter, setFilter] = useState<'today' | 'all'>('all');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [assignments, setAssignments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadClass() {
      const { data } = await supabase
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();
      setCls(data);

      // Get unique assignment names
      const { data: subs } = await supabase
        .from('submissions')
        .select('assignment_name')
        .eq('class_id', id)
        .not('assignment_name', 'is', null);

      if (subs) {
        const unique = [
          ...new Set(
            subs.map((s) => s.assignment_name).filter(Boolean) as string[]
          ),
        ];
        setAssignments(unique);
      }
    }
    loadClass();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filter, assignmentFilter]);

  async function loadIssues() {
    setLoading(true);
    const params = new URLSearchParams({
      classId: id as string,
      filter: assignmentFilter ? 'assignment' : filter,
    });
    if (assignmentFilter) {
      params.set('assignment', assignmentFilter);
    }

    const res = await fetch(`/api/teacher/issues?${params}`);
    const data = await res.json();

    setErrors(data.errorTypes || []);
    setTotalSubmissions(data.totalSubmissions || 0);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/teacher/class/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; 返回班级
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          课堂常见问题 {cls ? `— ${cls.class_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          可在课堂上直接展示，讲解学生常见错误
        </p>
      </div>

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            setFilter('all');
            setAssignmentFilter('');
          }}
          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
            filter === 'all' && !assignmentFilter
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          全部提交
        </button>
        <button
          onClick={() => {
            setFilter('today');
            setAssignmentFilter('');
          }}
          className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
            filter === 'today' && !assignmentFilter
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          今日提交
        </button>
        {assignments.map((a) => (
          <button
            key={a}
            onClick={() => {
              setAssignmentFilter(a);
              setFilter('all');
            }}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              assignmentFilter === a
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Issues display */}
      {loading ? (
        <p className="text-gray-500">加载中...</p>
      ) : (
        <ClassIssues errors={errors} totalSubmissions={totalSubmissions} />
      )}
    </div>
  );
}
