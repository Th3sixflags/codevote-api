import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

interface MySQLError { code?: string; errno?: number }

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // 1. Errores de validación de Zod. El `error` incluye los mensajes concretos
  //    (no solo un genérico) para que el frontend pueda mostrar qué campo falló.
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      path:    e.path.join('.'),
      message: e.message,
    }));
    res.status(422).json({
      error:   details.map((d) => d.message).join(' '),
      details,
    });
    return;
  }

  // 2. Errores de la aplicación con estado explícito
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // 3. Errores de restricciones de MySQL, traducidos a estados claros
  const my = err as MySQLError;
  if (my?.code === 'ER_ROW_IS_REFERENCED_2' || my?.errno === 1451) {
    // Se intenta eliminar un registro del que dependen otros (clave foránea).
    res.status(409).json({
      error: 'No se puede eliminar porque tiene información relacionada '
           + '(votaciones, votos, comprobantes, candidatos o auditorías). '
           + 'Considere cancelarlo o desactivarlo en lugar de eliminarlo.',
    });
    return;
  }
  if (my?.code === 'ER_NO_REFERENCED_ROW_2' || my?.errno === 1452) {
    // Se referencia (por FK) a un registro que no existe.
    res.status(400).json({ error: 'Referencia inválida: alguno de los identificadores enviados no existe.' });
    return;
  }
  if (my?.code === 'ER_DUP_ENTRY' || my?.errno === 1062) {
    // Violación de una restricción única.
    res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
    return;
  }

  // 4. Cualquier otro error no previsto
  console.error('[Error no manejado]', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
}
