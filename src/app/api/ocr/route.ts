import { NextRequest, NextResponse } from 'next/server';
import { performOCR } from '@/lib/ocr';

export async function POST(request: NextRequest) {
  try {
    const { imageBase64 } = await request.json();

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 });
    }

    const text = await performOCR(imageBase64);
    return NextResponse.json({ text });
  } catch (error) {
    console.error('OCR error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `OCR failed: ${message}. Please try again or type your text manually.` },
      { status: 500 }
    );
  }
}
