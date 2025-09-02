import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { vectorStoreService, ChatMessage } from './vectorStore.js';
import { documentService } from './documentService.js';
import { config } from '../config/env.js';

export interface ChatRequest {
  message: string;
  userId: string;
  userApiKey?: string;
}

export interface ChatResponse {
  id: string;
  response: string;
  timestamp: Date;
  relevantContext?: string[];
}

class ChatService {
  private outputParser: StringOutputParser;

  constructor() {
    this.outputParser = new StringOutputParser();
  }

  private createLLMWithKey(apiKey: string): ChatOpenAI {
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Please provide your API key in settings.');
    }

    return new ChatOpenAI({
      apiKey: apiKey,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 500,
    });
  }

  async processChat(request: ChatRequest): Promise<ChatResponse> {
    try {
      if (!request.userApiKey) {
        throw new Error('OpenAI API key is required. Please provide your API key in settings.');
      }

      // Create user message
      const userMessage = vectorStoreService.createChatMessage(
        'user',
        request.message,
        request.userId
      );

      // Search for relevant chat history and documents in parallel
      const [chatContext, relevantDocuments] = await Promise.all([
        vectorStoreService.getChatContext(request.message, request.userId, request.userApiKey),
        documentService.searchDocuments(request.message, request.userId, request.userApiKey, 3)
      ]);

      // Build hybrid context: recent messages + relevant history + documents
      const recentContext = chatContext.recentMessages
        .slice(-8) // Last 8 messages for immediate context
        .map(msg => `${msg.role}: ${msg.content}`);

      const semanticContext = chatContext.relevantHistory
        .filter(doc => {
          // Avoid duplicating recent messages in semantic context
          const recentIds = new Set(chatContext.recentMessages.map(m => m.id));
          return !recentIds.has(doc.metadata.id);
        })
        .map(doc => doc.pageContent)
        .slice(0, 4); // Increased semantic context

      const documentContext = relevantDocuments
        .map(doc => `Document: ${doc.metadata.fileName}\nContent: ${doc.pageContent}`)
        .slice(0, 3); // Increased document context

      // Organize context sections for better clarity
      const contextSections = [];
      
      if (recentContext.length > 0) {
        contextSections.push(`RECENT CONVERSATION:\n${recentContext.join('\n')}`);
      }
      
      if (semanticContext.length > 0) {
        contextSections.push(`RELEVANT HISTORY:\n${semanticContext.join('\n\n')}`);
      }
      
      if (documentContext.length > 0) {
        contextSections.push(`DOCUMENTS:\n${documentContext.join('\n\n')}`);
      }

      const allContext = contextSections;

      // Create prompt template with enhanced context
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', `You are a helpful AI assistant. You have access to:

1. RECENT CONVERSATION: Your immediate conversation history for context and continuity
2. RELEVANT HISTORY: Semantically related past conversations for deeper context  
3. DOCUMENTS: Uploaded documents that may be relevant

Context:
{context}

Instructions:
- Maintain natural conversation flow using recent messages
- Reference relevant history and documents when helpful
- Be conversational, helpful, and contextually aware
- If referencing document content, mention the document name
- Acknowledge when you're building on previous parts of the conversation
- If no relevant context exists, respond naturally to the current question`],
        ['human', '{input}'],
      ]);

      // Format the prompt
      const formattedPrompt = await promptTemplate.formatMessages({
        context: allContext.length > 0 
          ? allContext.join('\n\n---\n\n') 
          : 'No previous conversation context or document content available.',
        input: request.message,
      });

      // Get response from LLM using user's key if provided
      const llm = this.createLLMWithKey(request.userApiKey);
      const response = await llm.invoke(formattedPrompt);
      const responseText = await this.outputParser.invoke(response);

      // Create assistant message
      const assistantMessage = vectorStoreService.createChatMessage(
        'assistant',
        responseText,
        request.userId
      );

      // Store both messages in vector store asynchronously (fire-and-forget)
      // This will not block the response
      vectorStoreService.addChatMessage(userMessage, request.userApiKey);
      vectorStoreService.addChatMessage(assistantMessage, request.userApiKey);

      return {
        id: assistantMessage.id,
        response: responseText,
        timestamp: assistantMessage.timestamp,
        relevantContext: allContext,
      };

    } catch (error) {
      console.error('❌ Chat processing error:', error);
      throw new Error('Failed to process chat message');
    }
  }

  async getChatHistory(userId: string, query?: string, userApiKey?: string): Promise<ChatMessage[]> {
    if (query) {
      if (!userApiKey) {
        console.log('🔍 No user API key provided for chat history search, returning recent messages only');
        return vectorStoreService.getRecentMessages(userId);
      }
      
      const relevantDocs = await vectorStoreService.searchRelevantHistory(query, userId, userApiKey, 10);
      return relevantDocs.map(doc => ({
        id: doc.metadata.id,
        role: doc.metadata.role,
        content: doc.pageContent.replace(/^(user|assistant): /, ''),
        timestamp: new Date(doc.metadata.timestamp),
        userId: doc.metadata.userId,
      }));
    }
    
    // If no query, return empty array (could implement recent messages if needed)
    return [];
  }

  async startNewConversation(userId: string): Promise<string> {
    return vectorStoreService.startNewConversation(userId);
  }

  getConversationInfo(userId: string) {
    return vectorStoreService.getSessionInfo(userId);
  }

  getServiceStats() {
    return {
      vectorStore: vectorStoreService.getStats(),
      llmModel: 'gpt-3.5-turbo',
    };
  }
}

export const chatService = new ChatService(); 