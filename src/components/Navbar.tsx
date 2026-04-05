'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/types';

export default function Navbar() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [joining, setJoining] = useState(false);
  const joinRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (joinRef.current && !joinRef.current.contains(e.target as Node)) {
        setJoinOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinMsg(null);

    const res = await fetch('/api/classes/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: joinCode }),
    });

    const data = await res.json();
    setJoining(false);

    if (data.success || data.class) {
      setJoinMsg({ type: 'ok', text: `Joined: ${data.class.class_name}` });
      setJoinCode('');
      setTimeout(() => {
        setJoinOpen(false);
        setJoinMsg(null);
        router.refresh();
      }, 1200);
    } else {
      setJoinMsg({ type: 'err', text: data.error || 'Failed to join' });
    }
  };

  const isTeacher = profile?.role === 'teacher';
  const isStudent = !isTeacher;

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

          {/* Desktop nav */}
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

            {isStudent && (
              <div className="relative" ref={joinRef}>
                <button
                  onClick={() => setJoinOpen(!joinOpen)}
                  className={`text-sm ${
                    joinOpen
                      ? 'text-blue-600 font-medium'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Join Class
                </button>
                {joinOpen && <JoinDropdown />}
              </div>
            )}

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

          {/* Mobile hamburger */}
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

        {/* Mobile menu */}
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

            {isStudent && (
              <div className="py-2.5">
                <button
                  onClick={() => setJoinOpen(!joinOpen)}
                  className="text-sm text-gray-700"
                >
                  Join Class
                </button>
                {joinOpen && (
                  <div className="mt-2">
                    <JoinDropdown />
                  </div>
                )}
              </div>
            )}

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

  function JoinDropdown() {
    return (
      <div className="md:absolute md:right-0 md:top-full md:mt-2 md:w-64 bg-white md:rounded-xl md:border md:border-gray-200 md:shadow-lg md:p-4">
        <p className="text-xs text-gray-500 mb-2 hidden md:block">
          Enter your teacher&apos;s invite code
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={6}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 uppercase tracking-widest text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={joining}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {joining ? '...' : 'Join'}
          </button>
        </div>
        {joinMsg && (
          <p className={`text-xs mt-2 ${joinMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {joinMsg.text}
          </p>
        )}
      </div>
    );
  }
}
