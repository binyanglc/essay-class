import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classRole, escapeLike, normalizeEmail } from '@/lib/class-access';
import type { ClassTeacher } from '@/types';

/**
 * The teachers of a class (migration v21): the teacher who created it, and the
 * teachers they added by email. Every teacher of the class can see the list;
 * only the creator adds or removes teachers; an added teacher can leave.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadProfiles(supabase: Supabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string; email: string }>();
  const { data } = await supabase.from('profiles').select('id, name, email').in('id', ids);
  return new Map((data ?? []).map((p) => [p.id as string, { name: (p.name as string) ?? '', email: (p.email as string) ?? '' }]));
}

/** Postgres / PostgREST: the class_teachers table isn't there yet (migration v21 not run). */
function isMissingTable(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /class_teachers/.test(error.message ?? ''));
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    const role = await classRole(supabase, id, user.id);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { data: cls } = await supabase.from('classes').select('teacher_id, created_at').eq('id', id).single();
    if (!cls) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: rows, error } = await supabase
      .from('class_teachers')
      .select('teacher_id, added_at')
      .eq('class_id', id)
      .order('added_at', { ascending: true });
    // Before migration v21 only the creator is listed, and teachers can't be added yet
    const ready = !error;
    if (error && !isMissingTable(error)) console.error('Class teachers GET error:', error);

    const added = (rows ?? []) as { teacher_id: string; added_at: string }[];
    const profiles = await loadProfiles(supabase, [cls.teacher_id, ...added.map((r) => r.teacher_id)]);
    const person = (teacherId: string, isOwner: boolean, addedAt: string | null): ClassTeacher => ({
      id: teacherId,
      name: profiles.get(teacherId)?.name ?? '',
      email: profiles.get(teacherId)?.email ?? '',
      is_owner: isOwner,
      added_at: addedAt,
    });

    return NextResponse.json({
      me: { id: user.id, role },
      ready,
      teachers: [person(cls.teacher_id, true, null), ...added.map((r) => person(r.teacher_id, false, r.added_at))],
    });
  } catch (error) {
    console.error('Class teachers GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** The creator adds a teacher by the email they signed up with. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    const role = await classRole(supabase, id, user.id);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'Only the teacher who created this class can add teachers.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    if (!email) return NextResponse.json({ error: 'Enter an email address.' }, { status: 400 });

    const { data: found } = await supabase
      .from('profiles')
      .select('id, name, email, role')
      .ilike('email', escapeLike(email))
      .limit(5);
    const accounts = (found ?? []) as { id: string; name: string; email: string; role: string }[];
    if (accounts.length === 0) {
      return NextResponse.json(
        { error: `No account uses ${email}. Ask them to sign up as a teacher first, then add them here.` },
        { status: 404 }
      );
    }
    const account = accounts.find((a) => a.role === 'teacher') ?? accounts[0];
    if (account.id === user.id) {
      return NextResponse.json({ error: 'That’s your own email — you already teach this class.' }, { status: 400 });
    }
    if (account.role !== 'teacher') {
      return NextResponse.json(
        { error: `${email} is a student account. They need to sign up as a teacher (with another email) first.` },
        { status: 400 }
      );
    }

    const { data: row, error } = await supabase
      .from('class_teachers')
      .insert({ class_id: id, teacher_id: account.id, added_by: user.id })
      .select('teacher_id, added_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: `${account.name || email} already teaches this class.` }, { status: 409 });
      }
      console.error('Class teachers POST error:', error);
      const message = isMissingTable(error)
        ? 'Adding teachers needs the latest database update (migration v21).'
        : 'Couldn’t add this teacher. Please try again.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const teacher: ClassTeacher = {
      id: account.id,
      name: account.name ?? '',
      email: account.email ?? email,
      is_owner: false,
      added_at: row?.added_at ?? new Date().toISOString(),
    };
    return NextResponse.json(teacher);
  } catch (error) {
    console.error('Class teachers POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** The creator removes a teacher, or an added teacher leaves the class (?teacherId=…). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    const teacherId = request.nextUrl.searchParams.get('teacherId');
    if (!teacherId) return NextResponse.json({ error: 'Missing teacherId' }, { status: 400 });

    const role = await classRole(supabase, id, user.id);
    if (!role) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    if (role === 'co_teacher' && teacherId !== user.id) {
      return NextResponse.json({ error: 'Only the teacher who created this class can remove teachers.' }, { status: 403 });
    }
    if (role === 'owner' && teacherId === user.id) {
      return NextResponse.json({ error: 'The teacher who created the class can’t be removed.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('class_teachers')
      .delete()
      .eq('class_id', id)
      .eq('teacher_id', teacherId)
      .select('teacher_id');
    if (error) {
      console.error('Class teachers DELETE error:', error);
      return NextResponse.json({ error: 'Couldn’t remove this teacher. Please try again.' }, { status: 500 });
    }
    if (!data || data.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Class teachers DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
