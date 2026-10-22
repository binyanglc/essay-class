'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}

function ForgotPasswordContent() {
  const searchParams = useSearchParams();
  const badLink = searchParams.get('error') === 'link';

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });

    if (authError) {
      setError(
        authError.status === 429
          ? 'Too many requests. Please wait a few minutes and try again.'
          : authError.message
      );
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center font-semibold text-lg mb-2">
          <span className="text-blue-600">ai</span>XIE Writing Lab
        </p>
        <h1 className="text-2xl font-bold text-center mb-8">Reset Password</h1>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 bg-blue-50 p-4 rounded-lg">
              If an account exists for <span className="font-medium">{email}</span>,
              we&apos;ve sent a link to reset your password. Check your inbox (and
              your spam folder).
            </p>
            <button
              onClick={() => setSent(false)}
              className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {badLink && !error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                That reset link is invalid or has expired. Enter your email to get a
                new one.
              </p>
            )}

            <p className="text-sm text-gray-500">
              Enter the email you signed up with and we&apos;ll send you a link to
              set a new password.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-6">
          Remembered it?{' '}
          <Link href="/login" className="text-blue-600 hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
