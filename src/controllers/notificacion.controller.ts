import { Request, Response } from 'express';
import * as service from '../services/notificacion.service.js';

/** Solo devuelve las notificaciones del estudiante autenticado. */
export async function listar(req: Request, res: Response) {
  const notificaciones = await service.listarDeEstudiante(req.user!.sub);
  res.json(notificaciones);
}

/** Marca una notificación como leída (solo si es del estudiante autenticado). */
export async function marcarLeida(req: Request, res: Response) {
  const actualizada = await service.marcarLeida(Number(req.params.id), req.user!.sub);
  if (!actualizada) {
    res.status(404).json({ error: 'Notificación no encontrada.' });
    return;
  }
  res.json(actualizada);
}
