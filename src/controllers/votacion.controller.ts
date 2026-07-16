import { Request, Response } from 'express';
import * as service from '../services/votacion.service';

export async function listar(_req: Request, res: Response) {
  const votaciones = await service.listarVotaciones();
  res.json(votaciones);
}

export async function obtener(req: Request, res: Response) {
  const votacion = await service.obtenerVotacion(Number(req.params.id));
  if (!votacion) {
    res.status(404).json({ error: 'Votación no encontrada.' });
    return;
  }
  res.json(votacion);
}

export async function listarPorProceso(req: Request, res: Response) {
  const votaciones = await service.listarPorProceso(Number(req.params.procesoId));
  res.json(votaciones);
}
