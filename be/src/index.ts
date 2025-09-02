import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import 'dotenv/config'

import { config } from './config/env.js';
import { apiRoutes } from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { clerkMiddleware } from '@clerk/express'
import { clerkClient, requireAuth, getAuth } from '@clerk/express'
import { vectorStoreService } from './services/vectorStore.js';


const app = express();

app.use(clerkMiddleware({
  publishableKey: config.CLERK_PUBLISHABLE_KEY,
  secretKey: config.CLERK_SECRET_KEY,
}))

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: '*', // config.CLIENT_ORIGIN,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// API routes
app.use('/api', apiRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`🚀 Server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  console.log(`📊 Health check: http://localhost:${config.PORT}/health`);
  
  // Initialize vector store in background
  vectorStoreService.initializeAsync();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

export default app; 