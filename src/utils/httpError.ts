/** Error con un estado HTTP explícito, para responder mensajes claros. */
export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
    this.details = details;
  }
}
