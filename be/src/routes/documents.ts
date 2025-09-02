import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getAuth, requireAuth } from '@clerk/express';
import { documentService } from '../services/documentService.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only text files and PDFs
    if (file.mimetype === 'text/plain' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only .txt and .pdf files are allowed'));
    }
  },
});

// Upload document endpoint
router.post('/upload', requireAuth(), upload.single('document'), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    const { userApiKey } = req.body;
    if (!userApiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is required for document processing',
      });
    }

    console.log(`📤 Processing document upload: ${req.file.originalname} for user: ${auth.userId}`);

    const processedDocument = await documentService.processDocument(req.file, auth.userId, userApiKey);

    res.json({
      success: true,
      data: {
        id: processedDocument.id,
        fileName: processedDocument.fileName,
        fileType: processedDocument.fileType,
        totalChunks: processedDocument.totalChunks,
        uploadedAt: processedDocument.uploadedAt,
      },
    });

  } catch (error) {
    console.error('❌ Document upload error:', error);
    
    if (error instanceof Error && error.message.includes('Unsupported file type')) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Only .txt and .pdf files are allowed.',
      });
    }

    if (error instanceof Error && error.message.includes('OpenAI API key')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process document',
    });
  }
});

// Get user's documents
router.get('/list', requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { userApiKey } = req.query;
    if (!userApiKey || typeof userApiKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is required',
      });
    }

    const documents = await documentService.getDocumentList(auth.userId, userApiKey);

    res.json({
      success: true,
      data: documents,
    });

  } catch (error) {
    console.error('❌ Failed to get document list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve documents',
    });
  }
});

// Search documents
router.post('/search', requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const searchSchema = z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(20).optional().default(5),
      userApiKey: z.string().min(1, 'OpenAI API key is required'),
    });

    const { query, limit, userApiKey } = searchSchema.parse(req.body);

    const results = await documentService.searchDocuments(query, auth.userId, userApiKey, limit);

    res.json({
      success: true,
      data: {
        query,
        results: results.map(doc => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
        count: results.length,
      },
    });

  } catch (error) {
    console.error('❌ Document search error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search parameters',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to search documents',
    });
  }
});

export { router as documentRoutes }; 