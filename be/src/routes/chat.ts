import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '@clerk/express';
import { chatService } from '../services/chatService.js';

const router = Router();

// Validation schemas
const chatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
  userApiKey: z.string().optional(),
});

const testApiKeySchema = z.object({
  userApiKey: z.string().min(1),
});

const chatHistoryQuerySchema = z.object({
  query: z.string().optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional(),
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

    const { query, limit } = chatHistoryQuerySchema.parse(req.query);

    const history = await chatService.getChatHistory(auth.userId, query);

    res.json({
      success: true,
      data: {
        messages: history.slice(0, limit || 20),
        total: history.length,
      },
    });

  } catch (error) {
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
    const { userApiKey } = testApiKeySchema.parse(req.body);

    // Validate that the key looks like an OpenAI key
    if (!userApiKey || !userApiKey.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid API key format',
      });
    }

    // Test the API key by making a simple call to OpenAI
    const { ChatOpenAI } = await import('@langchain/openai');
    
    const testLLM = new ChatOpenAI({
      openAIApiKey: userApiKey,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 10,
    });

    // Make a test call with proper message format
    await testLLM.invoke('test');

    res.json({
      success: true,
      message: 'API key is valid and working',
    });

  } catch (error: any) {
    console.error('API key test error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: error.errors,
      });
    }

    // Handle OpenAI API errors
    if (error.message?.includes('API key') || 
        error.message?.includes('OPENAI_API_KEY') ||
        error.status === 401 || 
        error.status === 403) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or unauthorized API key',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to test API key',
    });
  }
});

export default router; 