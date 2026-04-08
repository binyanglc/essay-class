import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: feedbackId } = await params;

    const { data, error } = await supabase
      .from('feedback_comments')
      .select('*, profiles!user_id(name, role)')
      .eq('feedback_id', feedbackId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Comments GET error:', error);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Comments GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id: feedbackId } = await params;
    const { section, message } = await request.json();

    if (!section || !message?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const { data, error } = await supabase
      .from('feedback_comments')
      .insert({
        feedback_id: feedbackId,
        section,
        user_id: user.id,
        role: profile?.role || 'student',
        message: message.trim(),
      })
      .select('*, profiles!user_id(name, role)')
      .single();

    if (error) {
      console.error('Comment POST error:', error);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Comment POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
