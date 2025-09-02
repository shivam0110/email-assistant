import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { EmailDraft } from './EmailDraft';
import ApiKeySettings from './ApiKeySettings';
import { getApiUrl } from '../config/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  contextUsed?: boolean;
}

interface ChatResponse {
  success: boolean;
  data: {
    id: string;
    message: string;
    timestamp: string;
    contextUsed: boolean;
  };
  error?: string;
  code?: string;
}

interface UploadedDocument {
  id: string;
  fileName: string;
  fileType: string;
  totalChunks: number;
  uploadedAt: string;
}

const Chat: React.FC = () => {
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isEmailDraftOpen, setIsEmailDraftOpen] = useState(false);
  const [isApiKeySettingsOpen, setIsApiKeySettingsOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Storage keys
  const STORAGE_KEY = 'chat-messages';
  const SESSION_KEY = 'chat-session-id';
  const API_KEY_STORAGE_KEY = 'user-openai-api-key';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load messages from localStorage
  const loadMessagesFromStorage = (): ChatMessage[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load messages from storage:', error);
    }
    return [];
  };

  // Save messages to localStorage
  const saveMessagesToStorage = (messages: ChatMessage[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save messages to storage:', error);
    }
  };

  // Load session ID from localStorage
  const loadSessionFromStorage = (): string | null => {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch (error) {
      console.error('Failed to load session from storage:', error);
      return null;
    }
  };

  // Save session ID to localStorage
  const saveSessionToStorage = (sessionId: string | null) => {
    try {
      if (sessionId) {
        localStorage.setItem(SESSION_KEY, sessionId);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (error) {
      console.error('Failed to save session to storage:', error);
    }
  };

  // Start a new conversation
  const startNewConversation = async () => {
    try {
      const token = await getToken();
      const response = await fetch(getApiUrl('/api/chat/new-conversation'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        const newSessionId = data.data.sessionId;
        setSessionId(newSessionId);
        setMessages([]);
        saveSessionToStorage(newSessionId);
        saveMessagesToStorage([]);
        console.log('Started new conversation:', newSessionId);
      }
    } catch (error) {
      console.error('Failed to start new conversation:', error);
    }
  };

  // Load user API key on component mount
  useEffect(() => {
    try {
      const storedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedApiKey) {
        setUserApiKey(storedApiKey);
      }
    } catch (error) {
      console.error('Failed to load API key from storage:', error);
    }
  }, []);

  // Initialize session and load messages
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Load stored messages first
        const storedMessages = loadMessagesFromStorage();
        const storedSessionId = loadSessionFromStorage();
        
        setMessages(storedMessages);
        setSessionId(storedSessionId);
        
        // Validate session with backend
        if (storedSessionId) {
          try {
            const token = await getToken();
            const response = await fetch(getApiUrl('/api/chat/session-info'), {
              headers: {
                'Authorization': `Bearer ${token}`,
              },
            });
            
            const data = await response.json();
            if (!data.success || !data.data.sessionId) {
              // Session is invalid, start new one
              await startNewConversation();
            }
          } catch (error) {
            console.log('Session validation failed, starting new conversation');
            await startNewConversation();
          }
        } else {
          // No stored session, start new one
          await startNewConversation();
        }
      } catch (error) {
        console.error('Failed to initialize session:', error);
      } finally {
        setIsLoadingSession(false);
      }
    };

    initializeSession();
  }, [getToken]);

  // Save messages to storage whenever they change
  useEffect(() => {
    if (!isLoadingSession) {
      saveMessagesToStorage(messages);
    }
  }, [messages, isLoadingSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const token = await getToken();
      const response = await fetch(getApiUrl('/api/documents/list'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setUploadedDocuments(data.data);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if API key is available
    if (!userApiKey) {
      setError('OpenAI API key is required to upload documents. Please click the 🔑 API Key button to configure your key.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('userApiKey', userApiKey);

      const token = await getToken();
      const response = await fetch(getApiUrl('/api/documents/upload'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setUploadedDocuments(prev => [...prev, data.data]);
        // Add a system message about the upload
        const systemMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📄 Document "${data.data.fileName}" has been uploaded successfully! It was processed into ${data.data.totalChunks} chunks. You can now ask questions about its content.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, systemMessage]);
      } else {
        setError(data.error || 'Failed to upload document');
      }
    } catch (err) {
      setError('Network error during upload. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    
    // Block sending if no API key is provided
    if (!userApiKey) {
      setError('OpenAI API key is required to send messages. Please click the 🔑 API Key button to configure your key.');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const requestBody = { 
        message: inputMessage,
        userApiKey: userApiKey // Always include since we've verified it exists
      };

      const response = await fetch(getApiUrl('/api/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data: ChatResponse = await response.json();

      if (data.success) {
        const assistantMessage: ChatMessage = {
          id: data.data.id,
          role: 'assistant',
          content: data.data.message,
          timestamp: new Date(data.data.timestamp),
          contextUsed: data.data.contextUsed,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Handle API key specific errors
        if (data.code === 'API_KEY_REQUIRED' || data.code === 'OPENAI_API_KEY_REQUIRED') {
          setError(`${data.error} Please click the 🔑 API Key button to configure your OpenAI API key.`);
        } else {
          setError(data.error || 'Failed to send message');
        }
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!userApiKey) {
        setError('OpenAI API key is required to send messages. Please click the 🔑 API Key button to configure your key.');
        return;
      }
      sendMessage();
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleOpenEmailDraft = () => {
    setIsEmailDraftOpen(true);
  };

  const getRecentConversationContext = () => {
    // Get the last 5 messages as context for email
    return messages
      .slice(-5)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
  };

  const handleApiKeyChange = (apiKey: string | null) => {
    setUserApiKey(apiKey);
  };

  if (isLoadingSession) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* <h2 className="text-xl font-bold">💬 AI Assistant</h2> */}
            {/* {sessionId && (
              <span className="text-indigo-100 text-xs bg-white/20 px-2 py-1 rounded-full">
                Session: {sessionId.slice(0, 8)}...
              </span>
            )} */}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsApiKeySettingsOpen(true)}
              className="inline-flex items-center px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-md transition-colors"
              title="OpenAI API Key Settings"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              API Key
            </button>
            <button
              onClick={startNewConversation}
              disabled={isLoadingSession}
              className="inline-flex items-center px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Chat
            </button>
          </div>
        </div>
      </div>

      {/* Document Status and API Key Status */}
      <div className="border-b border-secondary-100">
        {!userApiKey && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                    <span className="text-amber-600 text-lg">⚠️</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-amber-800 font-semibold">OpenAI API Key Required</h3>
                  <p className="text-amber-700 text-sm">Configure your API key to start chatting and using AI features.</p>
                </div>
              </div>
              <button
                onClick={() => setIsApiKeySettingsOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <span>🔑</span>
                <span>Configure API Key</span>
              </button>
            </div>
          </div>
        )}
        
        {(uploadedDocuments.length > 0 || userApiKey) && (
          <div className="bg-gradient-to-r from-secondary-50 to-accent-50 p-4">
            <div className="flex items-center justify-between">
              {uploadedDocuments.length > 0 && (
                <div className="flex items-center space-x-3">
                  <span className="text-secondary-700 font-semibold flex items-center">
                    📚 {uploadedDocuments.length} document{uploadedDocuments.length !== 1 ? 's' : ''} uploaded
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {uploadedDocuments.slice(0, 3).map((doc) => (
                      <span
                        key={doc.id}
                        className="bg-white/80 text-secondary-700 px-3 py-1 rounded-full text-xs font-medium shadow-sm border border-secondary-200"
                        title={`${doc.fileName} (${doc.totalChunks} chunks)`}
                      >
                        {doc.fileName.length > 20 ? `${doc.fileName.substring(0, 17)}...` : doc.fileName}
                      </span>
                    ))}
                    {uploadedDocuments.length > 3 && (
                      <span className="text-secondary-600 text-xs bg-white/60 px-2 py-1 rounded-full">
                        +{uploadedDocuments.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )}
              {userApiKey && (
                <div className="flex items-center space-x-2">
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-medium border border-green-200 flex items-center">
                    🔑 API key configured
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 bg-gradient-to-b from-gray-50 to-white">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-6">💬📄</div>
            <h3 className="text-xl font-semibold text-primary mb-3">Ready to help!</h3>
            <p className="text-gray-600 mb-2">Start a conversation or upload documents to get started.</p>
            <p className="text-sm text-gray-500">Supported formats: PDF, TXT</p>
            <div className="mt-6 flex justify-center space-x-4 text-sm">
              <div className="flex items-center space-x-2 bg-accent-50 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <span>Smart document search</span>
              </div>
              <div className="flex items-center space-x-2 bg-secondary-50 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 bg-secondary rounded-full"></div>
                <span>Contextual memory</span>
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-primary to-primary-600 text-white'
                  : 'bg-white text-gray-800 border border-gray-200'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${
                  message.role === 'user' ? 'text-primary-100' : 'text-gray-500'
                }`}>
                  {formatTime(message.timestamp)}
                </span>
                {message.role === 'assistant' && message.contextUsed && (
                  <span className="text-xs bg-accent-100 text-accent-700 px-2 py-1 rounded-full ml-2 font-medium">
                    🧠 Context
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 py-3 bg-red-50 border-t border-red-200">
          <p className="text-red-700 text-sm flex items-center">
            <span className="mr-2">⚠️</span>
            {error}
          </p>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 p-2 bg-white">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".txt,.pdf"
          className="hidden"
        />
        
        <div className="flex space-x-3 items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || !userApiKey}
            className="bg-gradient-to-r from-secondary to-secondary-600 text-white px-4 py-2 rounded-lg hover:from-secondary-600 hover:to-secondary-700 focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-md flex items-center space-x-2"
            title={!userApiKey ? "Please configure your API key first" : (isUploading ? "Uploading..." : "Upload Document")}
          >
            <span>{isUploading ? '📤' : '📎'}</span>
            {/* <span>{isUploading ? 'Uploading...' : 'Upload Document'}</span> */}
          </button>
          <button
            onClick={handleOpenEmailDraft}
            disabled={messages.length === 0 || !userApiKey}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-md flex items-center space-x-2"
            title={!userApiKey ? "Please configure your API key first" : "Generate email from conversation"}
          >
            <span>📧</span>
          </button>
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              userApiKey 
                ? "Ask me anything about your documents... (Press Enter to send)"
                : "Please configure your OpenAI API key first by clicking the 🔑 button above"
            }
            className={`flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-colors ${
              userApiKey 
                ? 'border-gray-300 bg-gray-50 focus:bg-white' 
                : 'border-amber-300 bg-amber-50 cursor-not-allowed'
            }`}
            rows={1}
            disabled={isLoading || !userApiKey}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading || !userApiKey}
            className="bg-gradient-to-r from-primary to-primary-600 text-white px-6 py-2 rounded-lg hover:from-primary-600 hover:to-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold shadow-md flex items-center space-x-2"
            title={!userApiKey ? "Please configure your API key first" : "Send message"}
          >
            <span>Send</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Email Draft Modal */}
      <EmailDraft
        isOpen={isEmailDraftOpen}
        onClose={() => setIsEmailDraftOpen(false)}
        initialContext={getRecentConversationContext()}
        userApiKey={userApiKey}
      />

      {/* API Key Settings Modal */}
      <ApiKeySettings
        isOpen={isApiKeySettingsOpen}
        onClose={() => setIsApiKeySettingsOpen(false)}
        onApiKeyChange={handleApiKeyChange}
      />
    </div>
  );
};

export default Chat; 