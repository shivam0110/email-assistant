// API Configuration
const VITE_API_URL = import.meta.env.VITE_API_URL;

export const API_CONFIG = {
  baseUrl: VITE_API_URL,
  endpoints: {
    // Chat endpoints
    chat: '/api/chat',
    chatHistory: '/api/chat/history',
    chatStats: '/api/chat/stats',
    chatTestApiKey: '/api/chat/test-api-key',
    chatNewConversation: '/api/chat/new-conversation',
    chatSessionInfo: '/api/chat/session-info',
    
    // Document endpoints
    documentsUpload: '/api/documents/upload',
    documentsList: '/api/documents/list',
    documentsSearch: '/api/documents/search',
    
    // Email endpoints
    emailDraft: '/api/email/draft',
    emailSend: '/api/email/send',
    emailDraftAndSend: '/api/email/draft-and-send',
    emailFromChat: '/api/email/from-chat',
    emailTestConnection: '/api/email/test-connection',
  }
};

// Utility function to build full API URLs
export const getApiUrl = (endpoint: string): string => {
  // For development with Vite proxy, use relative URLs
  if (import.meta.env.DEV) {
    return endpoint;
  }
  
  // For production, use full URLs
  if (!API_CONFIG.baseUrl) {
    console.error('Missing VITE_API_URL environment variable');
    console.error('Available env vars:', Object.keys(import.meta.env));
    throw new Error('VITE_API_URL environment variable is not set. Please configure it in your deployment environment.');
  }
  
  return `${API_CONFIG.baseUrl}${endpoint}`;
};

// Type for API response
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
