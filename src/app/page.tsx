'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export default function LandingPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGuestLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setLoading(false);
      router.push('/login');
      return;
    }
    router.push('/student/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex justify-between items-center">
          <span className="font-semibold text-lg">Writing Feedback</span>
          <Link
            href="/login"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Log In
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-4 py-10">
        <div className="max-w-lg mx-auto w-full">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 text-center sm:text-left">
            Get instant feedback on your Chinese writing
          </h1>
          <p className="text-gray-500 text-sm mb-8 text-center sm:text-left">
            Type or photograph your composition. AI gives you sentence-level corrections in seconds.
          </p>

          <div className="space-y-2.5">
            <button
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full border border-gray-300 text-gray-800 py-3 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {loading ? 'Entering...' : 'Enter as Guest — no sign up needed'}
            </button>

            <div className="flex gap-2.5">
              <Link
                href="/login"
                className="flex-1 text-center border border-gray-200 text-gray-600 py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="flex-1 text-center bg-gray-900 text-white py-3 rounded-xl text-sm hover:bg-gray-800 transition-colors"
              >
                Sign Up
              </Link>
            </div>
          </div>

          <div className="mt-14 space-y-4">
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500 text-xs font-medium">1</div>
              <div>
                <h3 className="font-medium text-sm">Type or upload a photo</h3>
                <p className="text-xs text-gray-400">Handwritten or typed — OCR extracts your Chinese text</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500 text-xs font-medium">2</div>
              <div>
                <h3 className="font-medium text-sm">Get AI corrections</h3>
                <p className="text-xs text-gray-400">Sentence-by-sentence feedback with clear explanations</p>
              </div>
            </div>
            <div className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500 text-xs font-medium">3</div>
              <div>
                <h3 className="font-medium text-sm">Track your progress</h3>
                <p className="text-xs text-gray-400">See which errors you repeat — sign up to save history</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
