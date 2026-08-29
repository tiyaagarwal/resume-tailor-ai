import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

const log = logger('http');

/** Wraps an async route handler so a rejected promise reaches errorHandler instead of hanging the request. */
export function asyncRoute<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Req, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) log.error(err.userMessage, err.details);
    else log.warn(err.userMessage, err.details);
    res.status(err.status).json({ error: err.userMessage, details: err.details });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  log.error('unhandled error', err instanceof Error ? err.stack : err);
  res.status(500).json({ error: `Something went wrong on the server: ${message}` });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route ${req.method} ${req.path}` });
}
