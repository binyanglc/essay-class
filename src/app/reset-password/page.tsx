'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Status = 'checking' | 'ready' | 'invalid';

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // The reset link signs the user in. Without a (non-guest) session there is
  // nothing to update, so ask for a new link instead.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setStatus(data.user && !data.user.is_anonymous ? 'ready' : 'invalid');
    });
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setDone(true);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    router.push(
      profile?.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center font-semibold text-lg mb-2">
          <span className="text-blue-600">ai</span>XIE Writing Lab
        </p>
        <h1 className="text-2xl font-bold text-center mb-8">Set New Password</h1>

        {status === 'checking' && (
          <p className="text-sm text-gray-500 text-center">Loading...</p>
        )}

        {status === 'invalid' && (
          <div className="space-y-4">
            <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full text-center bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Get a New Link
            </Link>
          </div>
        )}

        {status === 'ready' && done && (
          <p className="text-sm text-gray-700 bg-blue-50 p-4 rounded-lg">
            Password updated. Taking you to your dashboard...
          </p>
        )}

        {status === 'ready' && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
