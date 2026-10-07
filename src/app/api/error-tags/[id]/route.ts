import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ERROR_TAG_TYPES } from '@/types';
import {
  TAXONOMY_VERSION,
  canonicalPatternName,
  errorTypeFor,
  getCode,
  isCode,
  isDeleteReason,
  isNature,
  isSeverity,
  operationFor,
  ruleForCode,
} from '@/lib/error-taxonomy';

const short = (v: unknown, max = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * A teacher changes a label, or checks the AI's label and keeps it
 * ({ status: "confirmed" }). Changing an AI label marks it "modified"; the
 * AI's original stays in ai_original.
 */
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

    const { data: current } = await supabase
      .from('error_tags')
      .select('code, rule, item_target, item_learner, custom_label, source, status')
      .eq('id', id)
      .single();
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};
    // The example sentence (also edited from Common Issues)
    for (const key of ['original_text', 'suggested_revision', 'explanation', 'improvement_tip']) {
      if (typeof body[key] === 'string') updates[key] = body[key].slice(0, 2000);
    }

    // The label itself
    let labelChanged = false;
    const next = {
      code: current.code as string | null,
      rule: current.rule as string | null,
      item_target: current.item_target as string | null,
      item_learner: current.item_learner as string | null,
      custom_label: current.custom_label as string | null,
    };
    if ('code' in body) {
      if (!isCode(body.code)) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
      next.code = body.code;
      labelChanged = true;
    }
    if ('rule' in body) {
      next.rule = body.rule;
      labelChanged = true;
    }
    for (const key of ['item_target', 'item_learner'] as const) {
      if (key in body) {
        next[key] = short(body[key]);
        labelChanged = true;
      }
    }
    if ('custom_label' in body) {
      next.custom_label = short(body.custom_label, 80);
      labelChanged = true;
    }
    if ('nature' in body) {
      if (!isNature(body.nature)) return NextResponse.json({ error: 'Invalid nature' }, { status: 400 });
      updates.nature = body.nature;
      labelChanged = true;
    }
    if ('severity' in body) {
      if (body.severity !== null && !isSeverity(body.severity)) {
        return NextResponse.json({ error: 'Invalid severity' }, { status: 400 });
      }
      updates.severity = body.severity;
      labelChanged = true;
    }

    if (labelChanged) {
      if (!getCode(next.code)) return NextResponse.json({ error: 'A label needs a code' }, { status: 400 });
      next.rule = ruleForCode(next.code, next.rule);
      Object.assign(updates, next, {
        error_type: errorTypeFor(next.code!),
        pattern_name: canonicalPatternName(next),
        operation: operationFor(next.item_learner, next.item_target),
        taxonomy_version: TAXONOMY_VERSION,
        // An AI label the teacher changed; the teacher's own labels stay "added"
        status: current.source === 'teacher' || current.status === 'added' ? 'added' : 'modified',
      });
      // The AI's study tip was written for its own diagnosis
      updates.improvement_tip = '';
    } else if (body.status === 'confirmed') {
      if (current.status === 'suggested') updates.status = 'confirmed';
    }

    // Older labels (before the label list) could only be renamed
    if (!labelChanged && typeof body.pattern_name === 'string' && body.pattern_name.trim()) {
      updates.pattern_name = body.pattern_name.trim().slice(0, 80);
    }
    if (!labelChanged && 'error_type' in body) {
      if (!(ERROR_TAG_TYPES as readonly string[]).includes(body.error_type)) {
        return NextResponse.json({ error: 'Invalid error_type' }, { status: 400 });
      }
      updates.error_type = body.error_type;
    }

    if (Object.keys(updates).length === 0) {
      // Nothing to change (e.g. confirming a label that was already checked)
      return NextResponse.json({ success: true, unchanged: true });
    }

    const { data, error } = await supabase
      .from('error_tags')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('ErrorTag PUT error:', error);
      return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('ErrorTag PUT error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Removes a label. It is kept (status "deleted", with the optional reason) so
 * the record of what the AI suggested and what the teacher decided survives,
 * but students no longer see it and it isn't counted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

    const { id } = await params;
    let reason: unknown = null;
    try {
      reason = (await request.json())?.reason ?? null;
    } catch {
      // no body
    }

    const { data, error } = await supabase
      .from('error_tags')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        delete_reason: isDeleteReason(reason) ? reason : null,
      })
      .eq('id', id)
      .select('id');

    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 });
    // RLS: only the class teacher can change a label — anyone else updates nothing
    if (!data || data.length === 0) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ErrorTag DELETE error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
