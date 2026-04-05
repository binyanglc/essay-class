'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Class } from '@/types';

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [newClassName, setNewClassName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  useEffect(() => {
    loadClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClasses() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    setClasses(data || []);
  }

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    setCreating(true);
    setError('');

    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ className: newClassName }),
    });

    const data = await res.json();
    if (data.id) {
      setNewClassName('');
      loadClasses();
    } else {
      setError(data.error || '创建失败');
    }
    setCreating(false);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">班级管理</h1>

      {/* Create class */}
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold mb-3">创建新班级</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder="班级名称，例如：中文写作101"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            onClick={handleCreateClass}
            disabled={creating}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? '创建中...' : '创建班级'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </section>

      {/* Class list */}
      <section>
        <h2 className="font-semibold mb-4">我的班级</h2>
        {classes.length === 0 ? (
          <p className="text-gray-500 text-sm">还没有创建班级</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-xl border border-gray-200 p-5"
              >
                <h3 className="font-semibold text-lg mb-2">
                  {cls.class_name}
                </h3>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-500">邀请码：</span>
                  <code className="bg-gray-100 px-3 py-1 rounded text-sm font-mono tracking-widest">
                    {cls.invite_code}
                  </code>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/teacher/class/${cls.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    查看班级
                  </Link>
                  <span className="text-gray-300">|</span>
                  <Link
                    href={`/teacher/class/${cls.id}/issues`}
                    className="text-sm text-orange-600 hover:underline"
                  >
                    课堂问题
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
