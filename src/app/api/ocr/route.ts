import { NextRequest, NextResponse } from 'next/server';
import { performOCR } from '@/lib/ocr';

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: '缺少图片数据' }, { status: 400 });
    }

    const text = await performOCR(imageBase64);
    return NextResponse.json({ text });
  } catch (error) {
    console.error('OCR error:', error);
    return NextResponse.json(
      { error: 'OCR处理失败，请重试' },
      { status: 500 }
    );
  }
}
