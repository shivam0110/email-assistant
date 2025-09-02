import { Router } from 'express';
import { getAuth, requireAuth } from '@clerk/express';
import { clerkClient } from '@clerk/express';
import { z } from 'zod';
import { emailService } from '../services/emailService.js';
import { emailDraftService } from '../services/emailDraftService.js';

const router = Router();

// Validation schemas
const generateDraftSchema = z.object({
  context: z.string().min(1, 'Context is required'),
  tone: z.enum(['professional', 'casual', 'friendly']).optional().default('professional'),
  subjectHint: z.string().optional(),
  includeContext: z.boolean().optional().default(true),
  userApiKey: z.string().min(1, 'OpenAI API key is required'),
});

const sendEmailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  customRecipient: z.string().email().optional(), // Optional: send to different email
});

const testConnectionSchema = z.object({});

// Apply auth middleware to all email routes
router.use(requireAuth());

/**
 * POST /api/email/draft
 * Generate an AI-powered email draft
 */
router.post('/draft', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = auth.userId;
    const validatedData = generateDraftSchema.parse(req.body);
    
    console.log(`📝 Generating email draft for user: ${userId}`);
    
    const draft = await emailDraftService.generateDraft({
      userId,
      context: validatedData.context,
      tone: validatedData.tone,
      subjectHint: validatedData.subjectHint,
      includeContext: validatedData.includeContext,
      userApiKey: validatedData.userApiKey,
    });
    
    res.json({
      success: true,
      data: {
        draft,
        message: 'Email draft generated successfully',
      },
    });
  } catch (error: any) {
    console.error('❌ Error generating draft:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate email draft',
    });
  }
});

/**
 * POST /api/email/send
 * Send an email to the logged-in user's email address
 */
router.post('/send', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = auth.userId;
    const validatedData = sendEmailSchema.parse(req.body);
    
    console.log(`📤 Sending email for user: ${userId}`);
    
    // Get user's email address from Clerk
    let recipientEmail: string;
    
    if (validatedData.customRecipient) {
      recipientEmail = validatedData.customRecipient;
      console.log(`📧 Using custom recipient: ${recipientEmail}`);
    } else {
      // Get user's primary email from Clerk
      const user = await clerkClient.users.getUser(userId);
      
      if (!user.emailAddresses || user.emailAddresses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No email address found for user',
        });
      }
      
      // Use primary email or first available email
      const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      recipientEmail = primaryEmail?.emailAddress || user.emailAddresses[0].emailAddress;
      
      console.log(`📧 Using user's email: ${recipientEmail}`);
    }
    
    // Send the email
    const result = await emailService.sendEmail({
      to: recipientEmail,
      subject: validatedData.subject,
      body: validatedData.body,
      userId,
    });
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          messageId: result.messageId,
          recipient: recipientEmail,
          message: 'Email sent successfully',
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send email',
      });
    }
  } catch (error: any) {
    console.error('❌ Error sending email:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send email',
    });
  }
});

/**
 * POST /api/email/draft-and-send
 * Generate a draft and send it immediately
 */
router.post('/draft-and-send', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = auth.userId;
    const draftData = generateDraftSchema.parse(req.body);
    
    console.log(`🚀 Generating draft and sending email for user: ${userId}`);
    
    // Generate draft
    const draft = await emailDraftService.generateDraft({
      userId,
      context: draftData.context,
      tone: draftData.tone,
      subjectHint: draftData.subjectHint,
      includeContext: draftData.includeContext,
      userApiKey: draftData.userApiKey,
    });
    
    // Get user's email from Clerk
    const user = await clerkClient.users.getUser(userId);
    
    if (!user.emailAddresses || user.emailAddresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No email address found for user',
      });
    }
    
    const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
    const recipientEmail = primaryEmail?.emailAddress || user.emailAddresses[0].emailAddress;
    
    // Send the email
    const result = await emailService.sendEmail({
      to: recipientEmail,
      subject: draft.subject,
      body: draft.body,
      userId,
    });
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          draft,
          messageId: result.messageId,
          recipient: recipientEmail,
          message: 'Email generated and sent successfully',
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Failed to send email',
        draft, // Return the draft even if sending failed
      });
    }
  } catch (error: any) {
    console.error('❌ Error in draft-and-send:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate and send email',
    });
  }
});

/**
 * GET /api/email/test-connection
 * Test Nylas connection
 */
router.get('/test-connection', async (req, res) => {
  try {
    console.log(`🔍 Testing Nylas connection...`);
    
    const result = await emailService.testConnection();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Nylas connection is working',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Connection test failed',
      });
    }
  } catch (error: any) {
    console.error('❌ Error testing connection:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

/**
 * POST /api/email/from-chat
 * Generate email from recent chat messages
 */
router.post('/from-chat', requireAuth(), async (req, res) => {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = auth.userId;
    const { messages, tone, userApiKey } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required',
      });
    }

    if (!userApiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is required',
      });
    }
    
    console.log(`💬 Generating email from chat for user: ${userId}`);
    
    const draft = await emailDraftService.generateFromChatContext(
      userId,
      messages,
      userApiKey,
      tone || 'professional'
    );
    
    res.json({
      success: true,
      data: {
        draft,
        message: 'Email draft generated from conversation',
      },
    });
  } catch (error: any) {
    console.error('❌ Error generating email from chat:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate email from chat',
    });
  }
});

export default router; 