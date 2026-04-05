'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';

export default function Navbar() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setIsAnonymous(user.is_anonymous ?? false);
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(data);
      }
    }
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isTeacher = profile?.role === 'teacher';

  const links = isTeacher
    ? [{ href: '/teacher/dashboard', label: 'My Classes' }]
    : [
        { href: '/student/dashboard', label: 'Dashboard' },
        { href: '/student/submit', label: 'New Submission' },
        { href: '/student/submissions', label: 'My Submissions' },
        { href: '/student/errors', label: 'Error Patterns' },
      ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      {isAnonymous && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-center">
          <span className="text-xs text-blue-700">
            You&apos;re using a guest account.{' '}
            <Link href="/signup" className="underline font-medium">
              Create an account
            </Link>{' '}
            to save your progress permanently.
          </span>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-14">
          <Link
            href={isTeacher ? '/teacher/dashboard' : '/student/dashboard'}
            className="font-semibold text-lg text-gray-900"
          >
            Writing Feedback
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm ${
                  pathname === link.href
                    ? 'text-blue-600 font-medium'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {profile && (
              <span className="text-sm text-gray-400">
                {isAnonymous ? 'Guest' : profile.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Log Out
            </button>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden pb-4 border-t border-gray-100 pt-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block py-2.5 text-sm ${
                  pathname === link.href
                    ? 'text-blue-600 font-medium'
                    : 'text-gray-700'
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="block py-2.5 text-sm text-gray-500"
            >
              Log Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
