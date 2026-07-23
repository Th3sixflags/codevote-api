import { Request, Response } from 'express';
import { crearVotacionSchema, actualizarVotacionSchema } from '../schemas/votacion.schema.js';
import * as service from '../services/votacion.service.js';

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

export async function crear(req: Request, res: Response) {
  const data  = crearVotacionSchema.parse(req.body);
  const nueva = await service.crearVotacion(data);
  res.status(201).json(nueva);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarVotacionSchema.parse(req.body);
  const actualizada = await service.actualizarVotacion(Number(req.params.id), data);
  if (!actualizada) {
    res.status(404).json({ error: 'Votación no encontrada.' });
    return;
  }
  res.json(actualizada);
}

export async function eliminar(req: Request, res: Response) {
  const eliminada = await service.eliminarVotacion(Number(req.params.id));
  if (!eliminada) {
    res.status(404).json({ error: 'Votación no encontrada.' });
    return;
  }
  res.status(204).send();
}
