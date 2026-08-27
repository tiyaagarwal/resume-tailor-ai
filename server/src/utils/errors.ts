/** Errors that carry an HTTP status and a message safe to show a user. */
export class AppError extends Error {
  status: number;
  userMessage: string;
  details?: unknown;

  constructor(status: number, userMessage: string, details?: unknown) {
    super(userMessage);
    this.name = 'AppError';
    this.status = status;
    this.userMessage = userMessage;
    this.details = details;
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, m, d);
export const notFound = (m: string) => new AppError(404, m);
export const unprocessable = (m: string, d?: unknown) => new AppError(422, m, d);
export const upstream = (m: string, d?: unknown) => new AppError(502, m, d);
export const serverError = (m: string, d?: unknown) => new AppError(500, m, d);
