import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  console.error('🚨 Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Handle different error types
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: 'Validation Error',
      message: 'Invalid input data',
      details: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message
      }))
    });
    return;
  }

  // Handle custom app errors
  if ('statusCode' in err && typeof err.statusCode === 'number') {
    res.status(err.statusCode).json({
      error: err.name || 'Application Error',
      message: err.message
    });
    return;
  }

  // Handle syntax errors (bad JSON)
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON in request body'
    });
    return;
  }

  // Default to 500 server error
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong on our end' 
      : err.message
  });
} 