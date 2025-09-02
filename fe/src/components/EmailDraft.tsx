import React, { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getApiUrl } from '../config/api';

interface EmailDraft {
  subject: string;
  body: string;
  tone: string;
  generatedAt: string;
}

interface EmailDraftProps {
  isOpen: boolean;
  onClose: () => void;
  initialContext?: string;
  userApiKey?: string | null;
}

export const EmailDraft: React.FC<EmailDraftProps> = ({ isOpen, onClose, initialContext = '', userApiKey = null }) => {
  const { getToken } = useAuth();
  const [context, setContext] = useState(initialContext);
  const [tone, setTone] = useState<'professional' | 'casual' | 'friendly'>('professional');
  const [subjectHint, setSubjectHint] = useState('');
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const generateDraft = async () => {
    if (!context.trim()) {
      setError('Please provide context for the email');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getToken();
      const requestBody: any = {
        context,
        tone,
        subjectHint: subjectHint || undefined,
        includeContext: true,
      };

      // Include user API key if available
      if (userApiKey) {
        requestBody.userApiKey = userApiKey;
      }

      const response = await fetch(getApiUrl('/api/email/draft'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        setDraft(data.data.draft);
        setSuccess('Email draft generated successfully!');
      } else {
        // Handle API key specific errors
        if (data.code === 'OPENAI_API_KEY_REQUIRED') {
          setError(`${data.error} Please configure your OpenAI API key in settings.`);
        } else {
          setError(data.error || 'Failed to generate draft');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate draft');
    } finally {
      setIsGenerating(false);
    }
  };

  const sendEmail = async () => {
    if (!draft) return;

    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getToken();
      const response = await fetch(getApiUrl('/api/email/send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: draft.subject,
          body: draft.body,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`Email sent successfully to ${data.data.recipient}!`);
        // Reset form after successful send
        setTimeout(() => {
          setDraft(null);
          setContext('');
          setSubjectHint('');
          onClose();
        }, 2000);
      } else {
        setError(data.error || 'Failed to send email');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const draftAndSend = async () => {
    if (!context.trim()) {
      setError('Please provide context for the email');
      return;
    }

    setIsGenerating(true);
    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getToken();
      const requestBody: any = {
        context,
        tone,
        subjectHint: subjectHint || undefined,
        includeContext: true,
      };

      // Include user API key if available
      if (userApiKey) {
        requestBody.userApiKey = userApiKey;
      }

      const response = await fetch(getApiUrl('/api/email/draft-and-send'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success) {
        setDraft(data.data.draft);
        setSuccess(`Email generated and sent successfully to ${data.data.recipient}!`);
        // Reset form after successful send
        setTimeout(() => {
          setDraft(null);
          setContext('');
          setSubjectHint('');
          onClose();
        }, 2000);
      } else {
        // Handle API key specific errors
        if (data.code === 'OPENAI_API_KEY_REQUIRED') {
          setError(`${data.error} Please configure your OpenAI API key in settings.`);
        } else {
          setError(data.error || 'Failed to generate and send email');
        }
        if (data.draft) {
          setDraft(data.draft); // Show draft even if sending failed
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate and send email');
    } finally {
      setIsGenerating(false);
      setIsSending(false);
    }
  };

  const copyToClipboard = () => {
    if (!draft) return;
    
    const emailText = `Subject: ${draft.subject}\n\n${draft.body}`;
    navigator.clipboard.writeText(emailText);
    setSuccess('Email copied to clipboard!');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📧 AI Email Assistant</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">{success}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Input Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What would you like to write about? *
                </label>
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={6}
                  placeholder="Describe what you want to communicate in your email..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Tone
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="friendly">Friendly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Hint (optional)
                </label>
                <input
                  type="text"
                  value={subjectHint}
                  onChange={(e) => setSubjectHint(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Brief hint for the subject line..."
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={generateDraft}
                  disabled={!context.trim() || isGenerating}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Generating Draft...
                    </>
                  ) : (
                    '📝 Generate Draft'
                  )}
                </button>

                <button
                  onClick={draftAndSend}
                  disabled={!context.trim() || isGenerating || isSending}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isGenerating || isSending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {isGenerating ? 'Generating...' : 'Sending...'}
                    </>
                  ) : (
                    '🚀 Generate & Send'
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Generated Draft */}
            <div>
              {draft ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Generated Email Draft</h3>
                  
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subject:
                        </label>
                        <div className="text-gray-900 font-medium">{draft.subject}</div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Body:
                        </label>
                        <div className="bg-white border border-gray-200 rounded p-3 text-gray-900 whitespace-pre-wrap">
                          {draft.body}
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        Tone: {draft.tone} • Generated: {new Date(draft.generatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Draft Actions */}
                  <div className="flex space-x-2">
                    <button
                      onClick={copyToClipboard}
                      className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 flex items-center justify-center"
                    >
                      📋 Copy
                    </button>
                    
                    <button
                      onClick={sendEmail}
                      disabled={isSending}
                      className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isSending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        '📤 Send Email'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📧</div>
                    <p className="text-gray-600">Your generated email draft will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 