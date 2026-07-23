import { Request, Response } from 'express';
import { crearDirectorSchema, actualizarDirectorSchema } from '../schemas/director.schema.js';
import * as service from '../services/director.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarDirector();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerDirector(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Director no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function crear(req: Request, res: Response) {
  const data  = crearDirectorSchema.parse(req.body);
  const nuevo = await service.crearDirector(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarDirectorSchema.parse(req.body);
  const actualizado = await service.actualizarDirector(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Director no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarDirector(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Director no encontrado.' });
    return;
  }
  res.status(204).send();
}
