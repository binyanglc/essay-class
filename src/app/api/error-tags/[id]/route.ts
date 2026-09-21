import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ERROR_TAG_TYPES } from '@/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['original_text', 'suggested_revision', 'explanation', 'pattern_name', 'improvement_tip'];
    const updates: Record<string, string> = {};
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key];
    }
    // A teacher can move a label to another category
    if ('error_type' in body) {
      if (!(ERROR_TAG_TYPES as readonly string[]).includes(body.error_type)) {
        return NextResponse.json({ error: 'Invalid error_type' }, { status: 400 });
      }
      updates.error_type = body.error_type;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('error_tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    console.error('ErrorTag PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;

    const { error } = await supabase
      .from('error_tags')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ErrorTag DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
