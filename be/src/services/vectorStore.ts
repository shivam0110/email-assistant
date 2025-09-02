import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  userId: string;
}

export interface ChatContext {
  messages: ChatMessage[];
  relevantHistory: Document[];
  recentMessages: ChatMessage[];
}

export interface ConversationSession {
  sessionId: string;
  userId: string;
  messages: ChatMessage[];
  lastActivity: Date;
  createdAt: Date;
}

class VectorStoreService {
  private vectorStore: HNSWLib | null = null;
  private embeddings: OpenAIEmbeddings;
  private isInitialized = false;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private pendingMessages: ChatMessage[] = [];
  
  // In-memory conversation sessions (in production, use Redis or database)
  private conversationSessions: Map<string, ConversationSession> = new Map();
  private userCurrentSessions: Map<string, string> = new Map(); // userId -> sessionId
  
  // Configuration
  private readonly MAX_RECENT_MESSAGES = 15; // Increased for better context
  private readonly MAX_SESSION_AGE_HOURS = 48; // Extended session lifetime
  private readonly SESSION_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

  constructor() {
    try {
      // Only initialize embeddings if we have a system API key
      // Otherwise, embeddings will be limited when users don't provide their own key
      if (config.OPENAI_API_KEY) {
        this.embeddings = new OpenAIEmbeddings({
          openAIApiKey: config.OPENAI_API_KEY,
          modelName: 'text-embedding-3-small', // Smaller, cost-effective embedding model
          maxRetries: 3, // Add retry logic
          timeout: 60000, // 60 second timeout
        });
      } else {
        console.warn('⚠️  No system OpenAI API key configured. Document embeddings will require user-provided keys.');
        // Create a placeholder embeddings instance
        this.embeddings = new OpenAIEmbeddings({
          openAIApiKey: 'placeholder-key',
          modelName: 'text-embedding-3-small',
          maxRetries: 3,
          timeout: 60000,
        });
      }
      
      // Start session cleanup interval
      this.startSessionCleanup();
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI embeddings:', error);
      throw new Error('OpenAI embeddings initialization failed');
    }
  }

  private startSessionCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.SESSION_CLEANUP_INTERVAL);
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];
    
    for (const [sessionId, session] of this.conversationSessions.entries()) {
      const hoursSinceLastActivity = (now.getTime() - session.lastActivity.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastActivity > this.MAX_SESSION_AGE_HOURS) {
        expiredSessions.push(sessionId);
      }
    }
    
    expiredSessions.forEach(sessionId => {
      const session = this.conversationSessions.get(sessionId);
      if (session) {
        this.conversationSessions.delete(sessionId);
        // Remove user's current session reference if it matches
        if (this.userCurrentSessions.get(session.userId) === sessionId) {
          this.userCurrentSessions.delete(session.userId);
        }
      }
    });
    
    if (expiredSessions.length > 0) {
      console.log(`🧹 Cleaned up ${expiredSessions.length} expired conversation sessions`);
    }
  }

  private getCurrentSession(userId: string): ConversationSession {
    let sessionId = this.userCurrentSessions.get(userId);
    let session = sessionId ? this.conversationSessions.get(sessionId) : undefined;
    
    // Create new session if none exists or session is expired
    if (!session) {
      sessionId = uuidv4();
      session = {
        sessionId,
        userId,
        messages: [],
        lastActivity: new Date(),
        createdAt: new Date()
      };
      this.conversationSessions.set(sessionId, session);
      this.userCurrentSessions.set(userId, sessionId);
      console.log(`💬 Created new conversation session: ${sessionId} for user: ${userId}`);
    }
    
    return session;
  }

  private updateSessionActivity(session: ConversationSession): void {
    session.lastActivity = new Date();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Return existing initialization promise if already initializing
    if (this.isInitializing && this.initializationPromise) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    this.initializationPromise = this._doInitialize();
    
    try {
      await this.initializationPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async _doInitialize(): Promise<void> {
    try {
      // Initialize with a proper dummy document instead of empty string
      const dummyText = 'email assistant';
      this.vectorStore = await HNSWLib.fromTexts(
        [dummyText],
        [{ id: 'init' }],
        this.embeddings
      );
      this.isInitialized = true;
      console.log('✅ Vector store initialized');
      
      // Process any pending messages
      if (this.pendingMessages.length > 0) {
        console.log(`📦 Processing ${this.pendingMessages.length} pending messages`);
        const messages = [...this.pendingMessages];
        this.pendingMessages = [];
        
        // Process pending messages in background
        this._processPendingMessages(messages);
      }
    } catch (error) {
      console.error('❌ Failed to initialize vector store:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  private _processPendingMessages(messages: ChatMessage[]): void {
    // Process messages in background without blocking
    Promise.all(
      messages.map(message => this._addMessageToStore(message))
    ).catch(error => {
      console.error('❌ Failed to process pending messages:', error);
    });
  }

  private async _addMessageToStore(message: ChatMessage): Promise<void> {
    try {
      // Validate message content before processing
      if (!message.content || message.content.trim().length === 0) {
        console.warn('⚠️ Skipping empty message content');
        return;
      }

      // Create document from chat message
      const doc = new Document({
        pageContent: `${message.role}: ${message.content}`,
        metadata: {
          id: message.id,
          role: message.role,
          timestamp: message.timestamp.toISOString(),
          userId: message.userId,
        },
      });

      // Add to vector store
      await this.vectorStore!.addDocuments([doc]);
      
      // Also add to current conversation session
      const session = this.getCurrentSession(message.userId);
      session.messages.push(message);
      this.updateSessionActivity(session);
      
      // Keep only recent messages in session
      if (session.messages.length > this.MAX_RECENT_MESSAGES) {
        session.messages = session.messages.slice(-this.MAX_RECENT_MESSAGES);
      }
      
      console.log(`📝 Added message to vector store and session: ${message.id}`);
    } catch (error) {
      console.error('❌ Failed to add message to vector store:', error);
      // Don't throw error to avoid breaking the chat flow
    }
  }

  async addChatMessage(message: ChatMessage): Promise<void> {
    // If not initialized, add to pending queue and trigger background initialization
    if (!this.isInitialized) {
      this.pendingMessages.push(message);
      
      // Start initialization in background if not already started
      if (!this.isInitializing) {
        this.initialize().catch(error => {
          console.error('❌ Background vector store initialization failed:', error);
        });
      }
      
      console.log(`📋 Queued message for later processing: ${message.id}`);
      return; // Return immediately without waiting
    }

    // If initialized, process in background
    this._addMessageToStore(message).catch(error => {
      console.error('❌ Failed to add message to vector store:', error);
    });
  }

  // Synchronous version for when we actually need to wait
  async addChatMessageSync(message: ChatMessage): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this._addMessageToStore(message);
  }

  async searchRelevantHistory(
    query: string, 
    userId: string, 
    limit: number = 5
  ): Promise<Document[]> {
    if (!this.isInitialized) {
      // Don't wait for initialization during search, just return empty results
      console.log('🔍 Vector store not initialized, returning empty search results');
      return [];
    }

    // Validate query input
    if (!query || query.trim().length === 0) {
      console.warn('⚠️ Empty search query provided, returning empty results');
      return [];
    }

    try {
      // Search for relevant chat history
      const results = await this.vectorStore!.similaritySearchWithScore(query, limit * 2);
      
      // Filter by user and remove low relevance scores
      const relevantDocs = results
        .filter(([doc, score]) => {
          return doc.metadata.userId === userId && 
                 score > 0.6 && // Lower threshold for better context retrieval
                 doc.metadata.id !== 'init'; // Exclude dummy document
        })
        .map(([doc]) => doc)
        .slice(0, limit);

      console.log(`🔍 Found ${relevantDocs.length} relevant messages for query`);
      return relevantDocs;
    } catch (error) {
      console.error('❌ Failed to search vector store:', error);
      return [];
    }
  }

  async getChatContext(query: string, userId: string): Promise<ChatContext> {
    const [relevantHistory, recentMessages] = await Promise.all([
      this.searchRelevantHistory(query, userId),
      this.getRecentMessages(userId)
    ]);
    
    return {
      messages: [],
      relevantHistory,
      recentMessages,
    };
  }

  // Get recent messages from current conversation session
  async getRecentMessages(userId: string, limit?: number): Promise<ChatMessage[]> {
    const session = this.getCurrentSession(userId);
    const messageLimit = limit || this.MAX_RECENT_MESSAGES;
    
    return session.messages.slice(-messageLimit);
  }

  // Start a new conversation session for the user
  async startNewConversation(userId: string): Promise<string> {
    // Remove current session reference to force creation of new one
    this.userCurrentSessions.delete(userId);
    const session = this.getCurrentSession(userId);
    console.log(`🆕 Started new conversation session: ${session.sessionId} for user: ${userId}`);
    return session.sessionId;
  }

  // Get conversation session info
  getSessionInfo(userId: string): { sessionId: string; messageCount: number; lastActivity: Date } | null {
    const sessionId = this.userCurrentSessions.get(userId);
    if (!sessionId) return null;
    
    const session = this.conversationSessions.get(sessionId);
    if (!session) return null;
    
    return {
      sessionId: session.sessionId,
      messageCount: session.messages.length,
      lastActivity: session.lastActivity
    };
  }

  // Helper method to create chat message
  createChatMessage(
    role: 'user' | 'assistant',
    content: string,
    userId: string
  ): ChatMessage {
    return {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date(),
      userId,
    };
  }

  // Get store statistics
  getStats(): { initialized: boolean; hasStore: boolean; pendingMessages: number } {
    return {
      initialized: this.isInitialized,
      hasStore: this.vectorStore !== null,
      pendingMessages: this.pendingMessages.length,
    };
  }

  // Add documents directly to the vector store
  async addDocuments(documents: Document[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.vectorStore!.addDocuments(documents);
      console.log(`📚 Added ${documents.length} documents to vector store`);
    } catch (error) {
      console.error('❌ Failed to add documents to vector store:', error);
      throw error;
    }
  }

  // Search for documents specifically (not chat messages)
  async searchRelevantDocuments(
    query: string, 
    userId: string, 
    limit: number = 5
  ): Promise<Document[]> {
    if (!this.isInitialized) {
      console.log('🔍 Vector store not initialized, returning empty search results');
      return [];
    }

    if (!query || query.trim().length === 0) {
      // Return all documents for this user when no query provided
      try {
        const results = await this.vectorStore!.similaritySearchWithScore('document', limit * 5);
        return results
          .filter(([doc, score]) => {
            return doc.metadata.userId === userId && 
                   doc.metadata.type === 'document_chunk';
          })
          .map(([doc]) => doc)
          .slice(0, limit);
      } catch (error) {
        console.error('❌ Failed to get user documents:', error);
        return [];
      }
    }

    try {
      const results = await this.vectorStore!.similaritySearchWithScore(query, limit * 2);
      
      const relevantDocs = results
        .filter(([doc, score]) => {
          return doc.metadata.userId === userId && 
                 doc.metadata.type === 'document_chunk' &&
                 score > 0.6; // Lower threshold for documents
        })
        .map(([doc]) => doc)
        .slice(0, limit);

      console.log(`🔍 Found ${relevantDocs.length} relevant documents for query`);
      return relevantDocs;
    } catch (error) {
      console.error('❌ Failed to search documents:', error);
      return [];
    }
  }

  // Method to initialize the vector store during server startup
  async initializeAsync(): Promise<void> {
    console.log('🔄 Starting background vector store initialization...');
    this.initialize().catch(error => {
      console.error('❌ Background vector store initialization failed:', error);
    });
  }
}

// Export singleton instance
export const vectorStoreService = new VectorStoreService(); 