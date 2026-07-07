import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    res.status(422).json({
      error:   'Datos de entrada inválidos.',
      details: err.errors.map((e) => ({
        path:    e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }
  console.error('[Error no manejado]', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
