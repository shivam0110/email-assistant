import { Router } from 'express';
import { exampleRoutes } from './example.js';
import chatRoutes from './chat.js';
import { documentRoutes } from './documents.js';
import emailRoutes from './email.js';

const router = Router();

// Mount route modules
router.use('/example', exampleRoutes);
router.use('/chat', chatRoutes);
router.use('/documents', documentRoutes);
router.use('/email', emailRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'Email Assistant API',
    version: '1.0.0',
    description: 'Backend API for the email assistant application',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      example: '/api/example',
      chat: '/api/chat',
      chatHistory: '/api/chat/history',
      chatStats: '/api/chat/stats',
      documentUpload: '/api/documents/upload',
      documentList: '/api/documents/list',
      documentSearch: '/api/documents/search',
      emailDraft: '/api/email/draft',
      emailSend: '/api/email/send',
      emailDraftAndSend: '/api/email/draft-and-send',
      emailFromChat: '/api/email/from-chat',
      emailTestConnection: '/api/email/test-connection'
    }
  });
});

export { router as apiRoutes }; 