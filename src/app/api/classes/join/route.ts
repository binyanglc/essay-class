import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { inviteCode } = await request.json();

    if (!inviteCode) {
      return NextResponse.json({ error: '请输入邀请码' }, { status: 400 });
    }

    // Find class by invite code
    const { data: cls, error: classError } = await supabase
      .from('classes')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .single();

    if (classError || !cls) {
      return NextResponse.json({ error: '邀请码无效' }, { status: 404 });
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('class_members')
      .select('id')
      .eq('class_id', cls.id)
      .eq('student_id', user.id)
      .single();

    if (existing) {
      return NextResponse.json({ error: '已加入该班级', class: cls });
    }

    // Join class
    const { error: joinError } = await supabase
      .from('class_members')
      .insert({
        class_id: cls.id,
        student_id: user.id,
      });

    if (joinError) {
      console.error('Join class error:', joinError);
      return NextResponse.json({ error: '加入班级失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, class: cls });
  } catch (error) {
    console.error('Join class error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
