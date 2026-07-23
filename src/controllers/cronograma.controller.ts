import { Request, Response } from 'express';
import { crearCronogramaSchema, actualizarCronogramaSchema } from '../schemas/cronograma.schema.js';
import * as service from '../services/cronograma.service.js';

export async function listar(_req: Request, res: Response) {
  const registros = await service.listarCronograma();
  res.json(registros);
}

export async function obtener(req: Request, res: Response) {
  const registro = await service.obtenerCronograma(Number(req.params.id));
  if (!registro) {
    res.status(404).json({ error: 'Cronograma no encontrado.' });
    return;
  }
  res.json(registro);
}

export async function listarPorProceso(req: Request, res: Response) {
  const registros = await service.listarPorProceso(Number(req.params.procesoId));
  res.json(registros);
}

export async function crear(req: Request, res: Response) {
  const data  = crearCronogramaSchema.parse(req.body);
  const nuevo = await service.crearCronograma(data);
  res.status(201).json(nuevo);
}

export async function actualizar(req: Request, res: Response) {
  const data        = actualizarCronogramaSchema.parse(req.body);
  const actualizado = await service.actualizarCronograma(Number(req.params.id), data);
  if (!actualizado) {
    res.status(404).json({ error: 'Cronograma no encontrado.' });
    return;
  }
  res.json(actualizado);
}

export async function eliminar(req: Request, res: Response) {
  const eliminado = await service.eliminarCronograma(Number(req.params.id));
  if (!eliminado) {
    res.status(404).json({ error: 'Cronograma no encontrado.' });
    return;
  }
  res.status(204).send();
}
