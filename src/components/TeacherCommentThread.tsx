'use client';

import { useState } from 'react';
import { FeedbackComment, Profile } from '@/types';

interface Props {
  feedbackId: string;
  section: string;
  comments: FeedbackComment[];
  onRefresh: () => void;
}

export default function TeacherCommentThread({ feedbackId, section, comments, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const sectionComments = comments.filter((c) => c.section === section);
  const hasComments = sectionComments.length > 0;

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSending(true);
    const res = await fetch(`/api/feedback/${feedbackId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, message }),
    });
    setSending(false);
    if (res.ok) {
      setMessage('');
      setOpen(false);
      onRefresh();
    }
  };

  if (!hasComments && !open) return null;

  return (
    <div className="mt-2">
      {hasComments && (
        <div className="ml-3 border-l-2 border-blue-100 pl-3 space-y-2 mb-2">
          {sectionComments.map((c) => {
            const profile = c.profiles as unknown as Profile;
            const isTeacher = c.role === 'teacher';
            return (
              <div key={c.id} className={`text-xs p-2.5 rounded-lg ${
                isTeacher ? 'bg-blue-50' : 'bg-yellow-50'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`font-medium ${isTeacher ? 'text-blue-700' : 'text-yellow-700'}`}>
                    {profile?.name || (isTeacher ? 'Teacher' : 'Student')}
                  </span>
                  <span className="text-gray-300">&middot;</span>
                  <span className="text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-gray-700">{c.message}</p>
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="ml-3 mt-1 space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Reply to student..."
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={sending || !message.trim()}
              className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Reply'}
            </button>
            <button
              onClick={() => { setOpen(false); setMessage(''); }}
              className="text-xs text-gray-500 px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        hasComments && (
          <button
            onClick={() => setOpen(true)}
            className="ml-3 text-xs text-blue-600 hover:underline mt-1"
          >
            + Reply
          </button>
        )
      )}
    </div>
  );
}
