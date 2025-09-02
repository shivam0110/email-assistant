import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '@clerk/express';
import { chatService } from '../services/chatService.js';

const router = Router();

// Validation schemas
const chatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
  userApiKey: z.string().min(1, 'OpenAI API key is required'),
});

const testApiKeySchema = z.object({
  userApiKey: z.string().min(1),
});

const chatHistoryQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional(),
  userApiKey: z.string().optional(),
});

// POST /api/chat - Send a chat message
router.post('/', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { message, userApiKey } = chatMessageSchema.parse(req.body);

    const response = await chatService.processChat({
      message,
      userId: auth.userId,
      userApiKey,
    });

    res.json({
      success: true,
      data: {
        id: response.id,
        message: response.response,
        timestamp: response.timestamp,
        contextUsed: (response.relevantContext?.length ?? 0) > 0,
      },
    });

  } catch (error: any) {
    console.error('Chat endpoint error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid input',
        details: error.errors,
      });
    }

    // Handle API key errors
    if (error.message?.includes('OpenAI API key is required')) {
      return res.status(400).json({
        error: 'OpenAI API key is required. Please configure your API key in settings.',
        code: 'API_KEY_REQUIRED',
      });
    }

    res.status(500).json({
      error: 'Failed to process chat message',
    });
  }
});

// GET /api/chat/history - Get chat history (with optional search)
router.get('/history', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query, limit, userApiKey } = chatHistoryQuerySchema.parse(req.query);

    const messages = await chatService.getChatHistory(
      auth.userId,
      query,
      userApiKey
    );

    res.json({
      success: true,
      data: {
        messages: messages.slice(0, limit || 50),
        hasMore: messages.length > (limit || 50),
      },
    });

  } catch (error: any) {
    console.error('Chat history endpoint error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors,
      });
    }

    res.status(500).json({
      error: 'Failed to retrieve chat history',
    });
  }
});

// GET /api/chat/stats - Get chat service statistics
router.get('/stats', requireAuth(), async (req, res) => {
  try {
    const stats = chatService.getServiceStats();
    
    res.json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('Chat stats endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat statistics',
    });
  }
});

// POST /api/chat/new-conversation - Start a new conversation session
router.post('/new-conversation', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessionId = await chatService.startNewConversation(auth.userId);
    
    res.json({
      success: true,
      data: {
        sessionId,
        message: 'New conversation started'
      },
    });
  } catch (error) {
    console.error('New conversation endpoint error:', error);
    res.status(500).json({
      error: 'Failed to start new conversation',
    });
  }
});

// GET /api/chat/session-info - Get current conversation session info
router.get('/session-info', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessionInfo = chatService.getConversationInfo(auth.userId);
    
    res.json({
      success: true,
      data: sessionInfo || { message: 'No active conversation session' },
    });
  } catch (error) {
    console.error('Session info endpoint error:', error);
    res.status(500).json({
      error: 'Failed to retrieve session information',
    });
  }
});

// POST /api/chat/test-api-key - Test user's API key and trigger vector DB operations
router.post('/test-api-key', async (req, res) => {
  try {
    console.log('🔑 Testing API key...');
    
    const { userApiKey } = testApiKeySchema.parse(req.body);
    console.log('🔑 API key format validation passed');

    // Validate that the key looks like an OpenAI key
    if (!userApiKey || !userApiKey.startsWith('sk-')) {
      console.log('❌ API key format invalid:', userApiKey?.substring(0, 10) + '...');
      return res.status(400).json({
        success: false,
        error: 'Invalid API key format. API key should start with "sk-"',
      });
    }

    console.log('🔑 API key format looks correct, testing with OpenAI...');
    // Test the API key by making a simple call to OpenAI
    const { ChatOpenAI } = await import('@langchain/openai');
    
    const testLLM = new ChatOpenAI({
      apiKey: userApiKey,
      modelName: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 10,
    });

    // Make a test call with proper message format
    console.log('🔑 Making test call to OpenAI...');
    const testResponse = await testLLM.invoke('Hello');
    console.log('✅ OpenAI test call successful:', testResponse);

    res.json({
      success: true,
      message: 'API key is valid and working',
    });

  } catch (error: any) {
    console.error('❌ API key test error:', {
      message: error.message,
      status: error.status,
      code: error.code,
      type: error.constructor?.name,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: error.errors,
      });
    }

    // Handle specific OpenAI API errors
    if (error.status === 401) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API key - authentication failed',
      });
    }

    if (error.status === 403) {
      return res.status(400).json({
        success: false,
        error: 'API key does not have required permissions',
      });
    }

    if (error.status === 429) {
      return res.status(400).json({
        success: false,
        error: 'API key rate limit exceeded',
      });
    }

    if (error.code === 'insufficient_quota') {
      return res.status(400).json({
        success: false,
        error: 'API key has insufficient quota or credits',
      });
    }

    // Generic OpenAI API errors
    if (error.message?.includes('API key') || 
        error.message?.includes('OPENAI_API_KEY') ||
        error.message?.includes('authentication')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unauthorized API key',
        details: error.message,
      });
    }

    // Network or other errors
    res.status(500).json({
      success: false,
      error: 'Failed to test API key - please check your internet connection and try again',
      details: error.message,
    });
  }
});

export default router; 