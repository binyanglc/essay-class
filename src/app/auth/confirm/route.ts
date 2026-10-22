import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Landing point for links in Supabase auth emails (e.g. password reset).
// Handles both link styles:
//   - ?token_hash=...&type=recovery  (custom email template; works on any device)
//   - ?code=...                      (default template; must open in the same browser)
// On success the session cookie is set and the user is sent to `next`.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = safePath(searchParams.get('next'));

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const url = request.nextUrl.clone();
  url.search = '';

  if (ok) {
    url.pathname = next;
  } else if (next === '/reset-password' || type === 'recovery') {
    url.pathname = '/forgot-password';
    url.searchParams.set('error', 'link');
  } else {
    url.pathname = '/login';
  }

  return NextResponse.redirect(url);
}

// Only allow redirects to paths on this site.
function safePath(path: string | null) {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}
