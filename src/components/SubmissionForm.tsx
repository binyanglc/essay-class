'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  classId: string;
  projectId?: string;
}

async function compressImage(file: File, maxSizeKB = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down large images
        const maxDim = 1600;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // Compress with decreasing quality until under size limit
        let quality = 0.8;
        let base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];

        while (base64.length > maxSizeKB * 1024 && quality > 0.3) {
          quality -= 0.1;
          base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        }

        resolve(base64);
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function SubmissionForm({ classId, projectId }: Props) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [imagePath, setImagePath] = useState('');
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
      setError('Please upload a JPG or PNG image');
      return;
    }

    setOcrLoading(true);
    setError('');
    setImagePath('');

    // Keep the original photo for the teacher: private bucket, student's own folder.
    // If this fails, OCR still runs — the submission just won't have the photo attached.
    let photoSaved = false;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const ext = file.type === 'image/png' ? 'png' : 'jpg';
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('compositions')
        .upload(`${user.id}/${Date.now()}.${ext}`, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      setImagePath(uploadData.path);
      photoSaved = true;
    } catch (err) {
      console.error('Photo upload error:', err);
    }

    try {
      // Compress for OCR (must be under 1MB for free API)
      const base64 = await compressImage(file);

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });

      const data = await res.json();
      if (data.text) {
        setOcrText(data.text);
        setText(data.text);
        if (!photoSaved) {
          setError('The text was recognized, but the photo could not be saved for your teacher (max 10 MB, JPG or PNG).');
        }
      } else {
        setError(data.error || 'OCR recognition failed. You can type your text manually below.');
      }
    } catch (err) {
      console.error('OCR error:', err);
      setError('Text recognition failed. You can type your text manually below.');
    }
    setOcrLoading(false);
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Please enter your composition');
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
          projectId: projectId || undefined,
          title: title || undefined,
          imagePath: imagePath || undefined,
          ocrText: ocrText || undefined,
          finalText: text,
        }),
      });

      const data = await res.json();

      if (data.submission) {
        router.push(`/student/submissions/${data.submission.id}`);
      } else {
        setError(data.error || 'Submission failed');
      }
    } catch {
      setError('Submission failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title (optional)
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Composition title"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Photo (handwritten or printed)
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
          {ocrLoading ? 'Recognizing text...' : 'Click to upload image'}
        </button>
        {imagePath && (
          <p className="text-xs text-green-600 mt-2">
            Image uploaded. OCR text has been filled in below.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Composition
          {ocrText && (
            <span className="text-gray-400 font-normal ml-2">
              (OCR result — please review and correct)
            </span>
          )}
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Type or paste your Chinese composition here, or upload a photo above..."
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y outline-none"
        />
        <p className="text-xs text-gray-400 mt-1">{text.length} characters</p>
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
        {loading ? 'Submitting & generating feedback...' : 'Submit'}
      </button>

      {loading && (
        <p className="text-sm text-gray-500 animate-pulse">
          AI is analyzing your composition. Please wait (~10-20 seconds)...
        </p>
      )}
    </div>
  );
}
