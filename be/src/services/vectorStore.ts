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
      // Start session cleanup interval
      this.startSessionCleanup();
    } catch (error) {
      console.error('❌ Failed to initialize VectorStoreService:', error);
      throw new Error('VectorStoreService initialization failed');
    }
  }

  private createEmbeddingsWithKey(apiKey: string): OpenAIEmbeddings {
    if (!apiKey) {
      throw new Error('OpenAI API key is required for document embeddings. Please provide your API key in settings.');
    }

    return new OpenAIEmbeddings({
      apiKey: apiKey,
      modelName: 'text-embedding-3-small',
      maxRetries: 3,
      timeout: 60000,
    });
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
      // Initialize with a proper dummy document - this will use a temporary key
      // Real embeddings will be created per-request with user keys
      console.warn('⚠️ Vector store initialized without embeddings. Search operations will require user API keys.');
      this.isInitialized = true;
      console.log('✅ Vector store initialized (session management only)');
      
      // Process any pending messages (but they won't be embedded until user provides API key)
      if (this.pendingMessages.length > 0) {
        console.log(`📦 ${this.pendingMessages.length} messages queued for embedding when user API key is provided`);
        // Keep messages in pending state for now
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

  private async _addMessageToStore(message: ChatMessage, userApiKey?: string): Promise<void> {
    try {
      if (!userApiKey) {
        // Store message in pending queue for when user provides API key
        this.pendingMessages.push(message);
        console.log('📝 Message queued for embedding when user API key is provided');
        return;
      }

      if (!this.vectorStore) {
        // Initialize vector store with user's API key
        await this._initializeVectorStoreWithKey(userApiKey);
      }

      const document = new Document({
        pageContent: `${message.role}: ${message.content}`,
        metadata: {
          id: message.id,
          role: message.role,
          userId: message.userId,
          timestamp: message.timestamp.toISOString(),
        },
      });

      await this.vectorStore!.addDocuments([document]);
      console.log(`✅ Added message to vector store: ${message.id}`);
    } catch (error) {
      console.error('❌ Failed to add message to vector store:', error);
      throw error;
    }
  }

  private async _initializeVectorStoreWithKey(userApiKey: string): Promise<void> {
    try {
      const embeddings = this.createEmbeddingsWithKey(userApiKey);
      const dummyText = 'email assistant';
      this.vectorStore = await HNSWLib.fromTexts(
        [dummyText],
        [{ id: 'init' }],
        embeddings
      );
      
      console.log('✅ Vector store initialized with user API key');
      
      // Process any pending messages
      if (this.pendingMessages.length > 0) {
        console.log(`📦 Processing ${this.pendingMessages.length} pending messages`);
        const messages = [...this.pendingMessages];
        this.pendingMessages = [];
        
        // Process pending messages with the user's API key
        await Promise.all(
          messages.map(message => this._addMessageToStore(message, userApiKey))
        );
      }
    } catch (error) {
      console.error('❌ Failed to initialize vector store with user key:', error);
      throw error;
    }
  }

  async addChatMessage(message: ChatMessage, userApiKey?: string): Promise<void> {
    // Also add to current conversation session
    const session = this.getCurrentSession(message.userId);
    session.messages.push(message);
    this.updateSessionActivity(session);
    
    // Keep only recent messages in session
    if (session.messages.length > this.MAX_RECENT_MESSAGES) {
      session.messages = session.messages.slice(-this.MAX_RECENT_MESSAGES);
    }

    // If no user API key provided, just manage session without vector storage
    if (!userApiKey) {
      console.log(`📋 Added message to session (no vector storage): ${message.id}`);
      return;
    }

    // Process in background for vector storage
    this._addMessageToStore(message, userApiKey).catch(error => {
      console.error('❌ Failed to add message to vector store:', error);
    });
  }

  // Synchronous version for when we actually need to wait
  async addChatMessageSync(message: ChatMessage, userApiKey?: string): Promise<void> {
    // Also add to current conversation session
    const session = this.getCurrentSession(message.userId);
    session.messages.push(message);
    this.updateSessionActivity(session);
    
    // Keep only recent messages in session
    if (session.messages.length > this.MAX_RECENT_MESSAGES) {
      session.messages = session.messages.slice(-this.MAX_RECENT_MESSAGES);
    }

    if (!userApiKey) {
      console.log(`📋 Added message to session sync (no vector storage): ${message.id}`);
      return;
    }

    return this._addMessageToStore(message, userApiKey);
  }

  async searchRelevantHistory(
    query: string, 
    userId: string, 
    userApiKey?: string,
    limit: number = 5
  ): Promise<Document[]> {
    if (!userApiKey) {
      console.log('🔍 No user API key provided for search, returning empty results');
      return [];
    }

    if (!this.vectorStore) {
      try {
        await this._initializeVectorStoreWithKey(userApiKey);
      } catch (error) {
        console.error('❌ Failed to initialize vector store for search:', error);
        return [];
      }
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

  async getChatContext(query: string, userId: string, userApiKey?: string): Promise<ChatContext> {
    const [relevantHistory, recentMessages] = await Promise.all([
      this.searchRelevantHistory(query, userId, userApiKey),
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
  async addDocuments(documents: Document[], userApiKey: string): Promise<void> {
    if (!userApiKey) {
      throw new Error('OpenAI API key is required for document embeddings. Please provide your API key.');
    }

    if (!this.vectorStore) {
      await this._initializeVectorStoreWithKey(userApiKey);
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
    userApiKey?: string,
    limit: number = 5
  ): Promise<Document[]> {
    if (!userApiKey) {
      console.log('🔍 No user API key provided for document search, returning empty results');
      return [];
    }

    if (!this.vectorStore) {
      try {
        await this._initializeVectorStoreWithKey(userApiKey);
      } catch (error) {
        console.error('❌ Failed to initialize vector store for document search:', error);
        return [];
      }
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