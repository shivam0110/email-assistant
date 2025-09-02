import Nylas from 'nylas';
import { config } from '../config/env.js';

export interface EmailDraft {
  subject: string;
  body: string;
  recipient?: string;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  userId: string;
}

export class EmailService {
  private nylas: Nylas;

  constructor() {
    this.nylas = new Nylas({
      apiKey: config.NYLAS_CLIENT_SECRET, // In Nylas v7, client secret is used as API key
      apiUri: 'https://api.us.nylas.com', // Default Nylas API URI
    });
  }

  /**
   * Send email using the configured grant ID
   */
  async sendEmail(emailData: SendEmailRequest): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`🚀 Attempting to send email to: ${emailData.to}`);
      
      const message = await this.nylas.messages.send({
        identifier: config.NYLAS_GRANT_ID,
        requestBody: {
          to: [{ email: emailData.to }],
          subject: emailData.subject,
          body: emailData.body,
        },
      });

      console.log(`✅ Email sent successfully. Message ID: ${message.data.id}`);
      
      return {
        success: true,
        messageId: message.data.id,
      };
    } catch (error: any) {
      console.error('❌ Failed to send email:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Create a draft email (saved but not sent)
   */
  async createDraft(emailData: Omit<SendEmailRequest, 'userId'>): Promise<{ success: boolean; draftId?: string; error?: string }> {
    try {
      console.log(`📝 Creating email draft for: ${emailData.to}`);
      
      const draft = await this.nylas.drafts.create({
        identifier: config.NYLAS_GRANT_ID,
        requestBody: {
          to: [{ email: emailData.to }],
          subject: emailData.subject,
          body: emailData.body,
        },
      });

      console.log(`✅ Draft created successfully. Draft ID: ${draft.data.id}`);
      
      return {
        success: true,
        draftId: draft.data.id,
      };
    } catch (error: any) {
      console.error('❌ Failed to create draft:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to create draft',
      };
    }
  }

  /**
   * Send a draft by ID
   */
  async sendDraft(draftId: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      console.log(`📤 Sending draft: ${draftId}`);
      
      const message = await this.nylas.drafts.send({
        identifier: config.NYLAS_GRANT_ID,
        draftId: draftId,
      });

      console.log(`✅ Draft sent successfully. Message ID: ${message.data.id}`);
      
      return {
        success: true,
        messageId: message.data.id,
      };
    } catch (error: any) {
      console.error('❌ Failed to send draft:', error);
      
      return {
        success: false,
        error: error.message || 'Failed to send draft',
      };
    }
  }

  /**
   * Test Nylas connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to get grant info to test connection
      const grant = await this.nylas.grants.find({
        grantId: config.NYLAS_GRANT_ID,
      });

      console.log(`✅ Nylas connection successful. Grant status: ${grant.data.grantStatus}`);
      
      return { success: true };
    } catch (error: any) {
      console.error('❌ Nylas connection failed:', error);
      
      return {
        success: false,
        error: error.message || 'Connection test failed',
      };
    }
  }
}

// Export singleton instance
export const emailService = new EmailService(); 