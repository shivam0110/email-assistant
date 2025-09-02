import { ChatOpenAI } from '@langchain/openai';
import { vectorStoreService } from './vectorStore.js';
import { config } from '../config/env.js';
import { Document } from '@langchain/core/documents';

export interface DraftEmailRequest {
  userId: string;
  context: string;
  recipient?: string;
  tone?: 'professional' | 'casual' | 'friendly';
  subjectHint?: string;
  includeContext?: boolean;
  userApiKey: string; // Make required
}

export interface GeneratedDraft {
  subject: string;
  body: string;
  tone: string;
  generatedAt: Date;
}

export class EmailDraftService {
  constructor() {
    // No default LLM initialization - will create per request with user API key
  }

  private createLLMWithKey(apiKey: string): ChatOpenAI {
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Please provide your API key in settings.');
    }

    return new ChatOpenAI({
      apiKey: apiKey,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 1000,
    });
  }

  /**
   * Generate an email draft using AI and optional RAG context
   */
  async generateDraft(request: DraftEmailRequest): Promise<GeneratedDraft> {
    console.log(`🤖 Generating email draft for user: ${request.userId}`);
    
    if (!request.userApiKey) {
      throw new Error('OpenAI API key is required. Please provide your API key in settings.');
    }
    
    try {
      // Get relevant context if requested and available
      let relevantContext = '';
      if (request.includeContext !== false) {
        try {
          const similarMessages = await vectorStoreService.searchRelevantHistory(
            request.context,
            request.userId,
            request.userApiKey,
            3 // Get top 3 relevant pieces of context
          );
          
          if (similarMessages.length > 0) {
            relevantContext = similarMessages
              .map((msg: Document) => msg.pageContent)
              .join('\n\n');
          }
        } catch (error) {
          console.warn('⚠️ Could not retrieve context, proceeding without it:', error);
          // Continue without context if retrieval fails
        }
      }

      const prompt = this.buildEmailPrompt(request, relevantContext);
      const llm = this.createLLMWithKey(request.userApiKey);
      const response = await llm.invoke(prompt);
      
      const parsedDraft = this.parseEmailResponse(response.content as string, request);
      
      console.log(`✅ Email draft generated successfully`);
      
      return {
        ...parsedDraft,
        tone: request.tone || 'professional',
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('❌ Failed to generate email draft:', error);
      throw new Error(`Failed to generate email draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build the prompt for email generation
   */
  private buildEmailPrompt(request: DraftEmailRequest, context: string): string {
    const tone = request.tone || 'professional';
    const recipient = request.recipient || 'the recipient';
    
    return `You are an AI email assistant. Generate a ${tone} email based on the following information:

CONTEXT TO WRITE ABOUT:
${request.context}

TONE: ${tone}
RECIPIENT: ${recipient}
${request.subjectHint ? `SUBJECT HINT: ${request.subjectHint}` : ''}

${context ? `RELEVANT BACKGROUND INFORMATION:
${context}

` : ''}INSTRUCTIONS:
1. Write a clear, concise, and ${tone} email
2. Create an appropriate subject line
3. Structure the email with proper greeting, body, and closing
4. Make it actionable and specific
5. Keep it concise but complete
6. Use the background information if relevant, but don't mention it explicitly

Generate a JSON response with this EXACT format:
{
  "subject": "Your subject line here",
  "body": "Your email body here with proper formatting and line breaks"
}

Make sure the JSON is valid and the body includes proper paragraph breaks using \\n\\n where appropriate.`;
  }

  /**
   * Parse the AI response into structured email data
   */
  private parseEmailResponse(response: string, request: DraftEmailRequest): { subject: string; body: string } {
    try {
      // Clean the response to extract JSON
      let jsonStr = response.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.subject || !parsed.body) {
        throw new Error('Missing required fields: subject and body');
      }

      return {
        subject: parsed.subject.trim(),
        body: parsed.body.trim(),
      };
    } catch (error) {
      console.error('❌ Failed to parse email response:', error);
      console.error('Response was:', response);
      
      // Fallback: try to extract subject and body manually
      const lines = response.split('\n').filter(line => line.trim());
      
      return {
        subject: request.subjectHint || 'Email from AI Assistant',
        body: lines.join('\n\n') || request.context,
      };
    }
  }

  /**
   * Generate a quick draft from conversation context
   */
  async generateFromChatContext(userId: string, chatMessages: string[], userApiKey: string, tone: 'professional' | 'casual' | 'friendly' = 'professional'): Promise<GeneratedDraft> {
    const context = chatMessages.slice(-3).join('\n\n'); // Use last 3 messages
    
    return this.generateDraft({
      userId,
      context: `Based on our conversation: ${context}`,
      tone,
      includeContext: true,
      userApiKey,
    });
  }
}

// Export singleton instance
export const emailDraftService = new EmailDraftService(); 