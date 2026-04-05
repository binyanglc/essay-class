'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  classId: string;
}

export default function SubmissionForm({ classId }: Props) {
  const [title, setTitle] = useState('');
  const [assignmentName, setAssignmentName] = useState('');
  const [text, setText] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setError('请上传 JPG 或 PNG 格式的图片');
      return;
    }

    setOcrLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const fileName = `${Date.now()}_${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('compositions')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('compositions').getPublicUrl(uploadData.path);

      setImageUrl(publicUrl);

      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];

        try {
          const res = await fetch('/api/ocr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 }),
          });

          const data = await res.json();
          if (data.text) {
            setOcrText(data.text);
            setText(data.text);
          } else {
            setError(data.error || 'OCR识别失败');
          }
        } catch {
          setError('OCR识别失败，请手动输入');
        }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Upload error:', err);
      setError('图片上传失败');
      setOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('请输入作文内容');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
          title: title || undefined,
          assignmentName: assignmentName || undefined,
          imageUrl: imageUrl || undefined,
          ocrText: ocrText || undefined,
          finalText: text,
        }),
      });

      const data = await res.json();

      if (data.submission) {
        router.push(`/student/submissions/${data.submission.id}`);
      } else {
        setError(data.error || '提交失败');
      }
    } catch {
      setError('提交失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标题（选填）
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="作文标题"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            作业名称（选填）
          </label>
          <input
            type="text"
            value={assignmentName}
            onChange={(e) => setAssignmentName(e.target.value)}
            placeholder="例如：第三周作文"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          上传图片（手写或打印稿）
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleImageUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={ocrLoading}
          className="w-full sm:w-auto border-2 border-dashed border-gray-300 rounded-lg px-6 py-4 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50"
        >
          {ocrLoading ? '正在识别中...' : '点击上传图片'}
        </button>
        {imageUrl && (
          <p className="text-xs text-green-600 mt-2">
            图片已上传，OCR文字已填入下方
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          作文内容
          {ocrText && (
            <span className="text-gray-400 font-normal ml-2">
              （OCR识别结果，请检查并修正）
            </span>
          )}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="在此输入或粘贴中文作文，或上传图片自动识别..."
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y outline-none"
        />
        <p className="text-xs text-gray-400 mt-1">{text.length} 字</p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading || !text.trim()}
        className="w-full sm:w-auto bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '正在提交并生成反馈...' : '提交作文'}
      </button>

      {loading && (
        <p className="text-sm text-gray-500 animate-pulse">
          AI正在分析您的作文，请稍候（约10-20秒）...
        </p>
      )}
    </div>
  );
}
