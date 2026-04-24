import { Request, Response, NextFunction } from 'express';

/**
 * Global error-handling middleware.
 * Catches any unhandled errors thrown in route handlers and returns
 * a clean JSON error response instead of crashing the server.
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('🔥 Unhandled error:', err.message);
  console.error(err.stack);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message,
  });
};
