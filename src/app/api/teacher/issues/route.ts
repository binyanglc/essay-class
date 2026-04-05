import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClassErrorSummary } from '@/lib/error-tracking';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const classId = searchParams.get('classId');
    const projectId = searchParams.get('projectId');
    const filter = searchParams.get('filter') || 'all';
    const assignmentName = searchParams.get('assignment') || undefined;

    if (!classId) {
      return NextResponse.json({ error: 'Missing classId' }, { status: 400 });
    }

    let since: string | undefined;
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      since = today.toISOString();
    }

    const summary = await getClassErrorSummary(supabase, classId, {
      since,
      projectId: projectId || undefined,
      assignmentName: filter === 'assignment' ? assignmentName : undefined,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Teacher issues error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
