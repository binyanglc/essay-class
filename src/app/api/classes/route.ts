import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { className } = await request.json();

    if (!className) {
      return NextResponse.json({ error: '请输入班级名称' }, { status: 400 });
    }

    const inviteCode = generateInviteCode();

    const { data, error } = await supabase
      .from('classes')
      .insert({
        class_name: className,
        teacher_id: user.id,
        invite_code: inviteCode,
      })
      .select()
      .single();

    if (error) {
      console.error('Create class error:', error);
      return NextResponse.json({ error: '创建班级失败' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Create class error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
