import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { vectorStoreService } from './vectorStore.js';
import pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    fileName: string;
    fileType: string;
    chunkIndex: number;
    totalChunks: number;
    uploadedAt: string;
    userId: string;
  };
}

export interface ProcessedDocument {
  id: string;
  fileName: string;
  fileType: string;
  chunks: DocumentChunk[];
  totalChunks: number;
  uploadedAt: Date;
  userId: string;
}

class DocumentService {
  private textSplitter: RecursiveCharacterTextSplitter;

  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', ' ', ''],
    });
  }

  async processDocument(
    file: Express.Multer.File,
    userId: string,
    userApiKey: string
  ): Promise<ProcessedDocument> {
    try {
      if (!userApiKey) {
        throw new Error('OpenAI API key is required for document processing. Please provide your API key.');
      }

      let text: string;
      
      // Extract text based on file type
      switch (file.mimetype) {
        case 'text/plain':
          text = file.buffer.toString('utf-8');
          break;
        case 'application/pdf':
          const pdfData = await pdfParse(file.buffer);
          text = pdfData.text;
          break;
        default:
          throw new Error(`Unsupported file type: ${file.mimetype}`);
      }

      // Split text into chunks
      const textChunks = await this.textSplitter.splitText(text);
      
      const documentId = uuidv4();
      const uploadedAt = new Date();
      
      // Create document chunks
      const chunks: DocumentChunk[] = textChunks.map((chunk, index) => ({
        id: uuidv4(),
        content: chunk,
        metadata: {
          fileName: file.originalname,
          fileType: file.mimetype,
          chunkIndex: index,
          totalChunks: textChunks.length,
          uploadedAt: uploadedAt.toISOString(),
          userId,
        },
      }));

      // Convert chunks to LangChain documents
      const documents = chunks.map(chunk => new Document({
        pageContent: chunk.content,
        metadata: {
          ...chunk.metadata,
          documentId,
          type: 'document_chunk',
        },
      }));

      // Store in vector database
      await vectorStoreService.addDocuments(documents, userApiKey);

      const processedDoc: ProcessedDocument = {
        id: documentId,
        fileName: file.originalname,
        fileType: file.mimetype,
        chunks,
        totalChunks: textChunks.length,
        uploadedAt,
        userId,
      };

      console.log(`📄 Processed document: ${file.originalname} (${textChunks.length} chunks)`);
      return processedDoc;

    } catch (error) {
      console.error('❌ Failed to process document:', error);
      throw new Error(`Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchDocuments(
    query: string,
    userId: string,
    userApiKey?: string,
    limit: number = 5
  ): Promise<Document[]> {
    try {
      return await vectorStoreService.searchRelevantDocuments(query, userId, userApiKey, limit);
    } catch (error) {
      console.error('❌ Failed to search documents:', error);
      return [];
    }
  }

  // Get list of uploaded documents for a user
  async getDocumentList(userId: string, userApiKey?: string): Promise<Partial<ProcessedDocument>[]> {
    try {
      if (!userApiKey) {
        console.log('🔍 No user API key provided for document list, returning empty results');
        return [];
      }
      
      // This is a simplified version - in a real app you'd store document metadata separately
      const docs = await vectorStoreService.searchRelevantDocuments('', userId, userApiKey, 100);
      
      // Group by document and get unique documents
      const documentMap = new Map();
      docs.forEach(doc => {
        const docId = doc.metadata.documentId;
        if (docId && doc.metadata.type === 'document_chunk') {
          if (!documentMap.has(docId)) {
            documentMap.set(docId, {
              id: docId,
              fileName: doc.metadata.fileName,
              fileType: doc.metadata.fileType,
              uploadedAt: new Date(doc.metadata.uploadedAt),
              totalChunks: doc.metadata.totalChunks,
            });
          }
        }
      });

      return Array.from(documentMap.values());
    } catch (error) {
      console.error('❌ Failed to get document list:', error);
      return [];
    }
  }
}

export const documentService = new DocumentService(); 